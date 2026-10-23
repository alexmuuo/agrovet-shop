from datetime import datetime
from decimal import Decimal

from extensions import db

class StockMovement(db.Model):
__tablename__ = "stock_movements"


id = db.Column(
    db.Integer,
    primary_key=True,
    autoincrement=True,
)

cashier_id = db.Column(
    db.Integer,
    db.ForeignKey("cashiers.id", ondelete="RESTRICT"),
    nullable=False,
    index=True,
)

product_id = db.Column(
    db.Integer,
    db.ForeignKey("products.id", ondelete="RESTRICT"),
    nullable=False,
    index=True,
)

product_name = db.Column(
    db.String(150),
    nullable=False,
)

# Numeric(12, 3) supports decimal quantities to 3 places.
previous_stock = db.Column(
    db.Numeric(12, 3),
    nullable=False,
)

quantity_added = db.Column(
    db.Numeric(12, 3),
    nullable=False,
)

new_stock = db.Column(
    db.Numeric(12, 3),
    nullable=False,
)

reference = db.Column(
    db.String(150),
    nullable=True,
)

notes = db.Column(
    db.Text,
    nullable=True,
)

created_at = db.Column(
    db.DateTime,
    nullable=False,
    default=datetime.utcnow,
    index=True,
)

cashier = db.relationship(
    "Cashier",
    foreign_keys=[cashier_id],
)

product = db.relationship(
    "Product",
    foreign_keys=[product_id],
)

__table_args__ = (
    db.CheckConstraint(
        "quantity_added > 0",
        name="ck_stock_movements_quantity_positive",
    ),
    db.CheckConstraint(
        "previous_stock >= 0",
        name="ck_stock_movements_previous_stock_nonnegative",
    ),
    db.CheckConstraint(
        "new_stock = previous_stock + quantity_added",
        name="ck_stock_movements_stock_math",
    ),
)

def to_dict(self):
    return {
        "id": self.id,
        "cashier_id": self.cashier_id,
        "cashier_name": (
            self.cashier.full_name
            if self.cashier
            else None
        ),
        "product_id": self.product_id,
        "product_name": self.product_name,
        "previous_stock": (
            float(Decimal(str(self.previous_stock)))
            if self.previous_stock is not None
            else None
        ),
        "quantity_added": (
            float(Decimal(str(self.quantity_added)))
            if self.quantity_added is not None
            else None
        ),
        "new_stock": (
            float(Decimal(str(self.new_stock)))
            if self.new_stock is not None
            else None
        ),
        "reference": self.reference,
        "notes": self.notes,
        "created_at": (
            self.created_at.isoformat()
            if self.created_at
            else None
        ),
    }

