from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import uuid

from sqlalchemy import select

from extensions import db
from models.stock_batch import StockBatch
from models.stock_batch_allocation import StockBatchAllocation


QUANTITY_STEP = Decimal("0.001")


def to_quantity(value):
    try:
        result = Decimal(str(value)).quantize(
            QUANTITY_STEP,
            rounding=ROUND_HALF_UP,
        )
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid stock quantity.")

    if not result.is_finite() or result < 0:
        raise ValueError("Invalid stock quantity.")

    return result


def get_sale_item_allocations(sale_item_ids, *, lock=False):
    """
    Retrieve batch allocations for the supplied sale items.

    When lock=True, lock the allocation rows so concurrent void
    requests cannot restore the same allocation twice.
    """
    if not sale_item_ids:
        return []

    statement = (
        select(StockBatchAllocation)
        .where(
            StockBatchAllocation.sale_item_id.in_(
                sorted(set(sale_item_ids))
            )
        )
        .order_by(
            StockBatchAllocation.batch_id,
            StockBatchAllocation.id,
        )
    )

    if lock:
        statement = statement.with_for_update()

    return db.session.execute(statement).scalars().all()


def restore_sale_item_batches(sale_items):
    """
    Restore only allocations that have not already been restored.

    Batch balances, allocation restoration flags and the caller's
    branch-stock update must be committed in one transaction.
    This function never commits and never edits allocation history.
    """
    sale_item_ids = [
        item.id
        for item in sale_items
        if item.id is not None
    ]

    if not sale_item_ids:
        return {
            "restored": True,
            "allocation_count": 0,
            "restored_quantity": Decimal("0.000"),
            "message": "No persisted sale items to restore.",
        }

    allocations = get_sale_item_allocations(sale_item_ids, lock=True)

    if not allocations:
        return {
            "restored": False,
            "allocation_count": 0,
            "restored_quantity": Decimal("0.000"),
            "message": (
                "This sale has no batch allocation history. "
                "Its batch stock cannot be reconstructed safely."
            ),
        }

    # A batch-aware sale must have complete allocation coverage for
    # every line. Never restore only some lines and then add the full
    # sale quantity back to branch stock.
    allocations_by_item = {}
    for allocation in allocations:
        allocations_by_item.setdefault(allocation.sale_item_id, Decimal("0.000"))
        allocations_by_item[allocation.sale_item_id] += to_quantity(
            allocation.quantity
        )

    for item in sale_items:
        allocated_quantity = allocations_by_item.get(item.id)
        if allocated_quantity is None:
            raise ValueError(
                "Batch allocation history is incomplete for this sale. "
                "No inventory was changed; reconcile the sale first."
            )
        item_quantity = to_quantity(item.quantity)
        if abs(allocated_quantity - item_quantity) > Decimal("0.001"):
            raise ValueError(
                "Batch allocation quantity does not match the sale item. "
                "No inventory was changed; reconcile the sale first."
            )

    # A sale must be restored as a complete unit. Partial or mismatched
    # allocation history must be reconciled before any batch is changed.
    expected_quantities = {
        item.id: to_quantity(item.quantity)
        for item in sale_items
        if item.id is not None
    }
    allocated_quantities = {}
    for allocation in allocations:
        if allocation.sale_item_id not in expected_quantities:
            return {
                "restored": False,
                "allocation_count": 0,
                "restored_quantity": Decimal("0.000"),
                "message": "An allocation does not belong to this sale. No inventory was changed.",
            }
        allocated_quantities[allocation.sale_item_id] = (
            allocated_quantities.get(allocation.sale_item_id, Decimal("0.000"))
            + to_quantity(allocation.quantity)
        )

    for sale_item_id, expected_quantity in expected_quantities.items():
        if allocated_quantities.get(sale_item_id, Decimal("0.000")) != expected_quantity:
            return {
                "restored": False,
                "allocation_count": 0,
                "restored_quantity": Decimal("0.000"),
                "message": (
                    f"Batch allocations for sale item {sale_item_id} do not "
                    "match its sold quantity. No inventory was changed; "
                    "reconcile this sale before voiding it."
                ),
            }

    restored_count = sum(
        1 for allocation in allocations
        if bool(allocation.is_restored)
    )
    if restored_count:
        # Mixed restoration state is corruption/partial prior work. Do
        # not restore a subset while the route restores the full branch
        # quantity; require reconciliation instead.
        return {
            "restored": False,
            "allocation_count": 0,
            "restored_quantity": Decimal("0.000"),
            "message": (
                "One or more allocations for this sale were already "
                "restored. No inventory was changed; reconcile this sale."
            ),
        }

    pending_allocations = allocations

    batch_ids = sorted({
        allocation.batch_id
        for allocation in pending_allocations
    })

    batches = db.session.execute(
        select(StockBatch)
        .where(StockBatch.id.in_(batch_ids))
        .order_by(StockBatch.id)
        .with_for_update()
    ).scalars().all()

    batches_by_id = {batch.id: batch for batch in batches}
    if len(batches_by_id) != len(batch_ids):
        raise ValueError(
            "One or more original stock batches no longer exist. "
            "Batch restoration was cancelled."
        )

    quantities_by_batch = {}
    for allocation in pending_allocations:
        allocated_quantity = to_quantity(allocation.quantity)
        if allocated_quantity <= 0:
            raise ValueError("An invalid batch allocation was found.")
        quantities_by_batch[allocation.batch_id] = (
            quantities_by_batch.get(
                allocation.batch_id,
                Decimal("0.000"),
            ) + allocated_quantity
        )

    # Validate every batch before changing any balance or allocation flag.
    for batch_id, quantity_to_restore in quantities_by_batch.items():
        batch = batches_by_id[batch_id]
        current_remaining = to_quantity(batch.remaining_quantity)
        quantity_received = to_quantity(batch.quantity_received)
        if current_remaining + quantity_to_restore > quantity_received:
            raise ValueError(
                f"Restoring batch {batch_id} would exceed its original "
                "received quantity. Inventory reconciliation is required."
            )

    restored_at = datetime.utcnow()
    restoration_reference = f"VOID-{uuid.uuid4().hex[:16].upper()}"
    restored_quantity = Decimal("0.000")

    for batch_id, quantity_to_restore in quantities_by_batch.items():
        batch = batches_by_id[batch_id]
        batch.remaining_quantity = (
            to_quantity(batch.remaining_quantity) + quantity_to_restore
        )
        restored_quantity += quantity_to_restore

    for allocation in pending_allocations:
        allocation.is_restored = True
        allocation.restored_at = restored_at
        allocation.restoration_reference = restoration_reference

    return {
        "restored": True,
        "allocation_count": len(pending_allocations),
        "restored_quantity": to_quantity(restored_quantity),
        "restoration_reference": restoration_reference,
        "message": "Original stock batches restored successfully.",
    }


def sale_items_have_batch_allocations(sale_items):
    """
    Check whether any supplied sale item has batch allocations.

    Useful before editing a sale: replacing allocated sale items
    would otherwise destroy the link to their original batches.
    """
    sale_item_ids = [
        item.id
        for item in sale_items
        if item.id is not None
    ]

    if not sale_item_ids:
        return False

    allocation_id = db.session.execute(
        select(StockBatchAllocation.id)
        .where(
            StockBatchAllocation.sale_item_id.in_(
                sale_item_ids
            )
        )
        .limit(1)
    ).scalar_one_or_none()

    return allocation_id is not None
