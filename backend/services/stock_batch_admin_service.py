from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

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


def get_sale_item_allocations(sale_item_ids):
    """
    Retrieve batch allocations belonging to the supplied sale items.
    """
    if not sale_item_ids:
        return []

    return db.session.execute(
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
    ).scalars().all()


def restore_sale_item_batches(sale_items):
    """
    Restore the exact batches consumed by the supplied sale items.

    This function does not commit. The calling route must commit
    the batch restoration and its other inventory changes together.

    Returns:
        {
            "restored": bool,
            "allocation_count": int,
            "restored_quantity": Decimal,
            "message": str
        }

    Important:
    - Does not delete allocation history.
    - Does not modify BranchProductStock.
    - Does not commit independently.
    - Rejects inconsistent batch balances.
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

    allocations = get_sale_item_allocations(sale_item_ids)

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

    batch_ids = sorted({
        allocation.batch_id
        for allocation in allocations
    })

    batches = db.session.execute(
        select(StockBatch)
        .where(StockBatch.id.in_(batch_ids))
        .order_by(StockBatch.id)
        .with_for_update()
    ).scalars().all()

    batches_by_id = {
        batch.id: batch
        for batch in batches
    }

    missing_batch_ids = [
        batch_id
        for batch_id in batch_ids
        if batch_id not in batches_by_id
    ]

    if missing_batch_ids:
        raise ValueError(
            "One or more original stock batches no longer exist. "
            "Batch restoration was cancelled."
        )

    # Validate every allocation before changing any batch.
    quantities_by_batch = {}

    for allocation in allocations:
        allocated_quantity = to_quantity(
            allocation.quantity
        )

        if allocated_quantity <= 0:
            raise ValueError(
                "An invalid batch allocation was found."
            )

        quantities_by_batch[allocation.batch_id] = (
            quantities_by_batch.get(
                allocation.batch_id,
                Decimal("0.000"),
            )
            + allocated_quantity
        )

    # Validate that restoration will not exceed original receipts.
    for batch_id, quantity_to_restore in quantities_by_batch.items():
        batch = batches_by_id[batch_id]

        current_remaining = to_quantity(
            batch.remaining_quantity
        )

        quantity_received = to_quantity(
            batch.quantity_received
        )

        new_remaining = current_remaining + quantity_to_restore

        if new_remaining > quantity_received:
            raise ValueError(
                f"Restoring batch {batch_id} would exceed "
                "its original received quantity. "
                "Inventory reconciliation is required."
            )

    # All checks passed. Restore the original batches.
    restored_quantity = Decimal("0.000")

    for batch_id, quantity_to_restore in quantities_by_batch.items():
        batch = batches_by_id[batch_id]

        batch.remaining_quantity = (
            to_quantity(batch.remaining_quantity)
            + quantity_to_restore
        )

        restored_quantity += quantity_to_restore

    return {
        "restored": True,
        "allocation_count": len(allocations),
        "restored_quantity": to_quantity(restored_quantity),
        "message": (
            "Original stock batches restored successfully."
        ),
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
