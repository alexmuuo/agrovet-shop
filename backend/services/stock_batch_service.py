from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select

from extensions import db
from models.stock_batch import StockBatch
from models.stock_batch_allocation import StockBatchAllocation


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
