from datetime import datetime, timezone

from extensions import db


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class StockMovement(db.Model):
    __tablename__ = "stock_movements"

    id = db.Column(
        db.Integer,
        primary_key=True,
        autoincrement=True
    )

    cashier_id = db.Column(
        db.Integer,
        db.ForeignKey("cashiers.id"),
        nullable=False,
        index=True
    )

    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id"),
        nullable=False,
        index=True
    )

    product_name = db.Column(
        db.String(255),
        nullable=False
    )

    branch_id = db.Column(
        db.Integer,
        db.ForeignKey("branches.id"),
        nullable=False,
        index=True
    )

    previous_stock = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    quantity_added = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    new_stock = db.Column(
        db.Numeric(12, 3),
        nullable=False
    )

    reference = db.Column(
        db.String(100),
        nullable=True
    )

    notes = db.Column(
        db.Text,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=_utcnow,
        index=True
    )

    cashier = db.relationship(
        "Cashier",
        backref=db.backref("stock_movements", lazy=True)
    )

    product = db.relationship(
        "Product",
        backref=db.backref("stock_movements", lazy=True)
    )

    branch = db.relationship(
        "Branch",
        backref=db.backref("stock_movements", lazy=True)
    )

    __table_args__ = (
        db.CheckConstraint(
            "quantity_added > 0",
            name="ck_stock_movement_quantity_added_positive"
        ),
        db.CheckConstraint(
            "previous_stock >= 0",
            name="ck_stock_movement_previous_stock_nonnegative"
        ),
        db.CheckConstraint(
            "new_stock = previous_stock + quantity_added",
            name="ck_stock_movement_stock_arithmetic"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "cashier_id": self.cashier_id,
            "product_id": self.product_id,
            "product_name": self.product_name,
            "branch_id": self.branch_id,
            "previous_stock": float(self.previous_stock),
            "quantity_added": float(self.quantity_added),
            "new_stock": float(self.new_stock),
            "reference": self.reference,
            "notes": self.notes,
            "created_at": (
                self.created_at.isoformat()
                if self.created_at
                else None
            ),
        }
