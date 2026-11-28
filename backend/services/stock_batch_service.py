import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy import select

from extensions import db
from models.stock_batch import StockBatch
from models.stock_batch_allocation import StockBatchAllocation


logger = logging.getLogger(__name__)

ZERO = Decimal("0.000")
MONEY = Decimal("0.01")
QUANTITY = Decimal("0.001")


def money(value):
    return Decimal(str(value)).quantize(
        MONEY,
        rounding=ROUND_HALF_UP
    )


def quantity(value):
    return Decimal(str(value)).quantize(QUANTITY)


def allocate_stock_from_batches(
    sale_item,
    branch_id,
    product_id,
    required_quantity,
    portions_per_unit=1
):
    """
    Allocate a sale item against FIFO stock batches.

    Returns:
        {
            "success": bool,
            "message": str,
            "cost": Decimal,
            "revenue": Decimal,
            "gross_profit": Decimal,
            "allocations": list
        }

    The caller must commit or rollback the transaction.
    """

    required_quantity = quantity(required_quantity)

    if required_quantity <= ZERO:
        raise ValueError("Invalid stock quantity.")

    if not isinstance(portions_per_unit, int):
        raise ValueError("Invalid portion configuration.")

    if portions_per_unit < 1:
        raise ValueError("Invalid portion configuration.")

    # FIFO: oldest receipt first.
    batches = db.session.execute(
        select(StockBatch)
        .where(
            StockBatch.branch_id == branch_id,
            StockBatch.product_id == product_id,
            StockBatch.remaining_quantity > ZERO
        )
        .order_by(
            StockBatch.created_at.asc(),
            StockBatch.id.asc()
        )
        .with_for_update()
    ).scalars().all()

    available = sum(
        (
            Decimal(str(batch.remaining_quantity))
            for batch in batches
        ),
        ZERO
    )

    if available < required_quantity:
        raise ValueError(
            f"Insufficient batch-tracked stock. "
            f"Available: {available:.3f}; "
            f"required: {required_quantity:.3f}."
        )

    remaining = required_quantity

    total_cost = Decimal("0.00")
    total_revenue = Decimal("0.00")

    allocations = []

    for batch in batches:

        if remaining <= ZERO:
            break

        batch_available = quantity(
            batch.remaining_quantity
        )

        if batch_available <= ZERO:
            continue

        allocated_quantity = min(
            remaining,
            batch_available
        )

        buying_price = Decimal(
            str(batch.buying_price)
        )

        selling_price = Decimal(
            str(batch.selling_price)
        )

        # For portion sales, divide the batch's whole-unit
        # selling price by the configured portions per unit.
        effective_selling_price = (
            selling_price
            / Decimal(portions_per_unit)
        )

        cost = money(
            buying_price * allocated_quantity
        )

        revenue = money(
            effective_selling_price * allocated_quantity
        )

        profit = money(revenue - cost)

        allocation = StockBatchAllocation(
            batch_id=batch.id,
            sale_item_id=sale_item.id,
            quantity=allocated_quantity,
            buying_price=buying_price,
            selling_price=selling_price,
            revenue=revenue,
            cost=cost,
            gross_profit=profit
        )

        db.session.add(allocation)

        batch.remaining_quantity = quantity(
            batch_available - allocated_quantity
        )

        remaining = quantity(
            remaining - allocated_quantity
        )

        total_cost += cost
        total_revenue += revenue

        allocations.append({
            "batch_id": batch.id,
            "quantity": allocated_quantity,
            "buying_price": buying_price,
            "selling_price": selling_price,
            "cost": cost,
            "revenue": revenue,
            "gross_profit": profit
        })

    if remaining > ZERO:
        raise ValueError(
            "Unable to allocate the complete sale quantity."
        )

    return {
        "success": True,
        "cost": money(total_cost),
        "revenue": money(total_revenue),
        "gross_profit": money(
            total_revenue - total_cost
        ),
        "allocations": allocations
    }


def reconcile_batch_balances_to_branch_stock(
    batches,
    branch_stock_quantity,
    *,
    branch_id,
    product_id,
    product_name=None,
    reason="BRANCH_STOCK_RECONCILIATION",
):
    """
    Bring remaining batch balances down to the authoritative branch stock.

    BranchProductStock is the quantity used by the POS and inventory screens.
    When manual stock corrections or historical workflows leave the sum of
    batch remainders above that quantity, reduce the newest remaining batches
    first. This preserves FIFO order and never changes receipt quantities,
    historical BP/SP, or sale allocation records.

    The caller must provide locked batches ordered oldest to newest and owns
    the surrounding database transaction.
    """
    try:
        target_quantity = Decimal(
            str(
                branch_stock_quantity
                if branch_stock_quantity is not None
                else "0"
            )
        )
        if not target_quantity.is_finite() or target_quantity < ZERO:
            raise InvalidOperation
        target_quantity = target_quantity.quantize(QUANTITY)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("The branch stock quantity is invalid.")

    current_total = sum(
        (
            Decimal(str(batch.remaining_quantity or ZERO)).quantize(QUANTITY)
            for batch in batches
        ),
        ZERO,
    )

    if not current_total.is_finite() or current_total < ZERO:
        raise ValueError("One or more batch balances are invalid.")

    excess = (current_total - target_quantity).quantize(QUANTITY)
    adjusted_batches = []

    if excess > ZERO:
        # Keep the oldest FIFO stock and reconcile the newest balances first.
        for batch in reversed(list(batches)):
            if excess <= ZERO:
                break

            current_remaining = Decimal(
                str(batch.remaining_quantity or ZERO)
            ).quantize(QUANTITY)

            if current_remaining <= ZERO:
                continue

            quantity_removed = min(current_remaining, excess).quantize(QUANTITY)
            new_remaining = (
                current_remaining - quantity_removed
            ).quantize(QUANTITY)

            batch.remaining_quantity = new_remaining

            audit_note = (
                "[AUTO_BATCH_RECONCILIATION] "
                f"at={datetime.utcnow().isoformat(timespec='seconds')}Z; "
                f"reason={reason}; branch_id={branch_id}; "
                f"product_id={product_id}; "
                f"quantity_removed={quantity_removed:.3f}; "
                f"branch_stock_target={target_quantity:.3f}; "
                f"batch_remaining_before={current_remaining:.3f}; "
                f"batch_remaining_after={new_remaining:.3f}"
            )
            existing_notes = (batch.notes or "").strip()
            batch.notes = (
                f"{existing_notes}\n{audit_note}"
                if existing_notes
                else audit_note
            )

            adjusted_batches.append({
                "batch_id": batch.id,
                "quantity_removed": quantity_removed,
                "remaining_quantity": new_remaining,
            })

            excess = (excess - quantity_removed).quantize(QUANTITY)

        if excess > ZERO:
            raise ValueError(
                "Batch balances could not be reconciled to branch stock. "
                "No sale or stock adjustment was saved."
            )

    final_total = (
        current_total
        - sum(
            (row["quantity_removed"] for row in adjusted_batches),
            ZERO,
        )
    ).quantize(QUANTITY)

    if adjusted_batches:
        logger.warning(
            "Reconciled batch balances to branch stock: "
            "reason=%s branch_id=%s product_id=%s product=%s "
            "batch_total_before=%s branch_stock=%s quantity_removed=%s "
            "batches_adjusted=%s",
            reason,
            branch_id,
            product_id,
            product_name or "Unknown product",
            current_total,
            target_quantity,
            current_total - final_total,
            len(adjusted_batches),
        )

    return {
        "adjusted": bool(adjusted_batches),
        "batch_quantity_before": current_total,
        "branch_stock_quantity": target_quantity,
        "quantity_removed": (current_total - final_total).quantize(QUANTITY),
        "batch_quantity_after": final_total,
        "untracked_stock_quantity": max(
            target_quantity - final_total,
            ZERO,
        ).quantize(QUANTITY),
        "adjusted_batches": adjusted_batches,
    }
