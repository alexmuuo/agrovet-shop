from datetime import datetime
from decimal import Decimal

from extensions import db


class StockBatch(db.Model):
    """
    Individual stock receipt.

    Every stock addition creates a separate batch.
    Buying and selling prices are permanently preserved.
    """

    __tablename__ = "stock_batches"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    reference = db.Column(
        db.String(80),
        nullable=True,
        index=True
    )

    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
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

    quantity_received = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    remaining_quantity = db.Column(
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

    # False identifies legacy stock whose historical cost is unknown.
    cost_is_known = db.Column(
        db.Boolean,
        nullable=False,
        default=True,
        server_default=db.true(),
    )

    supplier_reference = db.Column(
        db.String(150),
        nullable=True
    )

    notes = db.Column(
        db.Text,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True
    )

    product = db.relationship("Product")
    branch = db.relationship("Branch")
    cashier = db.relationship("Cashier")

    __table_args__ = (
        db.CheckConstraint(
            "quantity_received > 0",
            name="ck_stock_batch_received_positive"
        ),

        db.CheckConstraint(
            "remaining_quantity >= 0",
            name="ck_stock_batch_remaining_nonnegative"
        ),

        db.CheckConstraint(
            "remaining_quantity <= quantity_received",
            name="ck_stock_batch_remaining_valid"
        ),

        db.CheckConstraint(
            "buying_price >= 0",
            name="ck_stock_batch_bp_nonnegative"
        ),

        db.CheckConstraint(
            "selling_price >= 0",
            name="ck_stock_batch_sp_nonnegative"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_name": (
                self.product.name if self.product else None
            ),
            "branch_id": self.branch_id,
            "branch_name": (
                self.branch.name if self.branch else None
            ),
            "cashier_id": self.cashier_id,
            "quantity_received": float(
                self.quantity_received or 0
            ),
            "remaining_quantity": float(
                self.remaining_quantity or 0
            ),
            "buying_price": float(
                self.buying_price or 0
            ),
            "selling_price": float(
                self.selling_price or 0
            ),
            "cost_is_known": bool(self.cost_is_known),
            "supplier_reference": self.supplier_reference,
            "reference": self.reference,
            "notes": self.notes,
            "created_at": (
                self.created_at.isoformat()
                if self.created_at else None
            )
        }
