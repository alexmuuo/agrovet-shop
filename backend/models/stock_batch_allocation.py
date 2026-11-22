from datetime import datetime

from extensions import db


class StockBatchAllocation(db.Model):
    """
    Records exactly which stock batch supplied a POS sale.

    One sale item can consume multiple batches.
    Historical prices are retained even if catalogue prices change.
    """

    __tablename__ = "stock_batch_allocations"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    batch_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "stock_batches.id",
            ondelete="RESTRICT"
        ),
        nullable=False,
        index=True
    )

    sale_item_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "cashier_sale_items.id",
            ondelete="RESTRICT"
        ),
        nullable=False,
        index=True
    )

    quantity = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    buying_price = db.Column(
        db.Numeric(12, 2),
        nullable=False
    )

    selling_price = db.Column(
        db.Numeric(12, 2),
        nullable=False
    )

    revenue = db.Column(
        db.Numeric(12, 2),
        nullable=False
    )

    cost = db.Column(
        db.Numeric(12, 2),
        nullable=False
    )

    gross_profit = db.Column(
        db.Numeric(12, 2),
        nullable=False
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    batch = db.relationship(
        "StockBatch",
        backref=db.backref(
            "allocations",
            lazy="select"
        )
    )

    sale_item = db.relationship(
        "CashierSaleItem",
        backref=db.backref(
            "batch_allocations",
            lazy="select"
        )
    )

    __table_args__ = (
        db.CheckConstraint(
            "quantity > 0",
            name="ck_batch_allocation_quantity_positive"
        ),

        db.CheckConstraint(
            "buying_price >= 0",
            name="ck_batch_allocation_bp_nonnegative"
        ),

        db.CheckConstraint(
            "selling_price >= 0",
            name="ck_batch_allocation_sp_nonnegative"
        ),

        db.CheckConstraint(
            "revenue >= 0",
            name="ck_batch_allocation_revenue_nonnegative"
        ),

        db.CheckConstraint(
            "cost >= 0",
            name="ck_batch_allocation_cost_nonnegative"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "batch_id": self.batch_id,
            "sale_item_id": self.sale_item_id,
            "quantity": float(self.quantity),
            "buying_price": float(self.buying_price),
            "selling_price": float(self.selling_price),
            "revenue": float(self.revenue),
            "cost": float(self.cost),
            "gross_profit": float(self.gross_profit),
            "created_at": (
                self.created_at.isoformat()
                if self.created_at else None
            )
        }
