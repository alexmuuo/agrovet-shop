import uuid
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from extensions import db


ZERO = Decimal("0.00")
ZERO_QUANTITY = Decimal("0.000")
MONEY_PLACES = Decimal("0.01")


def decimal_value(value, default=ZERO):
    if value is None:
        return default

    return Decimal(str(value))


def money(value):
    return Decimal(str(value)).quantize(
        MONEY_PLACES,
        rounding=ROUND_HALF_UP
    )


class CashierSale(db.Model):
    __tablename__ = "cashier_sales"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    sale_number = db.Column(
        db.String(50),
        nullable=False,
        unique=True,
        default=lambda: f"POS-{uuid.uuid4().hex[:12].upper()}"
    )

    branch_id = db.Column(
        db.Integer,
        db.ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )

    cashier_id = db.Column(
        db.Integer,
        db.ForeignKey("cashiers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )

    total = db.Column(
        db.Numeric(10, 2),
        nullable=False
    )

    payment_method = db.Column(
        db.String(30),
        nullable=False
    )

    payment_status = db.Column(
        db.String(20),
        nullable=False,
        default="unpaid"
    )

    status = db.Column(
        db.String(30),
        nullable=False,
        default="completed"
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True
    )

    # Relationships

    branch = db.relationship(
        "Branch",
        back_populates="sales"
    )

    cashier = db.relationship(
        "Cashier"
    )

    items = db.relationship(
        "CashierSaleItem",
        back_populates="sale",
        cascade="all, delete-orphan"
    )

    payments = db.relationship(
        "CashierSalePayment",
        back_populates="sale",
        cascade="all, delete-orphan"
    )

    def to_dict(self):

        total = decimal_value(self.total)

        return {
            "id": self.id,
            "sale_number": self.sale_number,

            "branch_id": self.branch_id,
            "branch_name": (
                self.branch.name
                if self.branch
                else None
            ),

            "cashier_id": self.cashier_id,
            "cashier_name": (
                self.cashier.full_name
                if self.cashier
                else None
            ),

            "total": float(total),

            "payment_method": self.payment_method,
            "payment_status": self.payment_status,
            "status": self.status,

            "items": [
                item.to_dict()
                for item in self.items
            ],

            "created_at": (
                self.created_at.isoformat()
                if self.created_at
                else None
            )
        }


class CashierSaleItem(db.Model):
    __tablename__ = "cashier_sale_items"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    sale_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "cashier_sales.id",
            ondelete="CASCADE"
        ),
        nullable=False,
        index=True
    )

    product_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "products.id",
            ondelete="RESTRICT"
        ),
        nullable=False,
        index=True
    )

    # Quantity deducted from stock, expressed in whole-stock
    # unit equivalents.
    #
    # Example:
    # 2 portions from a bottle containing 4 portions:
    # quantity = 0.500

    quantity = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    # Actual customer-facing quantity sold.
    #
    # Example:
    # 2 portions:
    # sale_quantity = 2.000

    sale_quantity = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    # Examples: unit, bottle, portion.

    selling_unit = db.Column(
        db.String(50),
        nullable=False
    )

    # Price per customer-facing selling unit.
    #
    # For a sale spanning multiple batches with different
    # selling prices, this stores the weighted average price.
    #
    # Exact batch prices remain in stock_batch_allocations.

    price = db.Column(
        db.Numeric(10, 2),
        nullable=False
    )

    # Weighted average buying price per whole stock unit.
    #
    # Exact batch costs remain in stock_batch_allocations.

    buying_price = db.Column(
        db.Numeric(10, 2),
        nullable=True
    )

    # Relationships

    sale = db.relationship(
        "CashierSale",
        back_populates="items"
    )

    product = db.relationship(
        "Product"
    )

    # StockBatchAllocation defines the batch_allocations
    # back-reference on this model.

    __table_args__ = (

        db.CheckConstraint(
            "quantity > 0",
            name="ck_cashier_sale_item_quantity_positive"
        ),

        db.CheckConstraint(
            "sale_quantity > 0",
            name="ck_cashier_sale_item_sale_quantity_positive"
        ),

        db.CheckConstraint(
            "price >= 0",
            name="ck_cashier_sale_item_price_nonnegative"
        ),

        db.CheckConstraint(
            "buying_price IS NULL OR buying_price >= 0",
            name="ck_cashier_sale_item_buying_price_nonnegative"
        ),

    )

    def to_dict(self):

        stock_quantity = decimal_value(
            self.quantity,
            ZERO_QUANTITY
        )

        sale_quantity = decimal_value(
            self.sale_quantity,
            stock_quantity
        )

        price = decimal_value(self.price)

        buying_price = (
            decimal_value(self.buying_price)
            if self.buying_price is not None
            else None
        )

        # ------------------------------------------------
        # BATCH-AWARE CALCULATIONS
        # ------------------------------------------------

        allocations = list(
            getattr(self, "batch_allocations", []) or []
        )

        if allocations:

            # Revenue is the sum of revenue from the
            # actual batches consumed by this sale.

            subtotal = money(
                sum(
                    (
                        decimal_value(allocation.revenue)
                        for allocation in allocations
                    ),
                    ZERO
                )
            )

            cost_of_goods_sold = money(
                sum(
                    (
                        decimal_value(allocation.cost)
                        for allocation in allocations
                    ),
                    ZERO
                )
            )

            gross_profit = money(
                subtotal - cost_of_goods_sold
            )

            allocated_quantity = sum(
                (
                    decimal_value(
                        allocation.quantity,
                        ZERO_QUANTITY
                    )
                    for allocation in allocations
                ),
                ZERO_QUANTITY
            )

            # Exact weighted average BP and SP.

            if allocated_quantity > ZERO:

                buying_price = money(
                    cost_of_goods_sold / allocated_quantity
                )

                if self.selling_unit == "unit":
                    price = money(
                        subtotal / sale_quantity
                    )

            # Expose the individual batch records so
            # reports can inspect the exact historical prices.

            batch_allocations = [
                allocation.to_dict()
                for allocation in allocations
            ]

        else:

            # ------------------------------------------------
            # BACKWARD COMPATIBILITY FOR OLD SALES
            # ------------------------------------------------

            subtotal = money(
                price * sale_quantity
            )

            cost_of_goods_sold = (
                money(buying_price * stock_quantity)
                if buying_price is not None
                else None
            )

            gross_profit = (
                money(subtotal - cost_of_goods_sold)
                if cost_of_goods_sold is not None
                else None
            )

            batch_allocations = []

        return {

            "id": self.id,
            "sale_id": self.sale_id,

            "product_id": self.product_id,

            "product_name": (
                self.product.name
                if self.product
                else None
            ),

            # Stock-equivalent quantity consumed.

            "quantity": float(stock_quantity),

            # Actual quantity sold to the customer.

            "sale_quantity": float(sale_quantity),

            "selling_unit": self.selling_unit,

            # Weighted average prices for the sale line.
            # Exact batch prices are in batch_allocations.

            "price": float(price),

            "buying_price": (
                float(buying_price)
                if buying_price is not None
                else None
            ),

            "subtotal": float(subtotal),

            "cost_of_goods_sold": (
                float(cost_of_goods_sold)
                if cost_of_goods_sold is not None
                else None
            ),

            "gross_profit": (
                float(gross_profit)
                if gross_profit is not None
                else None
            ),

            "batch_allocations": batch_allocations
        }
