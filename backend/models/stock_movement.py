from datetime import datetime, timedelta, timezone

from extensions import db

# East Africa Time (UTC+3). Kenya has no daylight saving, so a fixed
# offset is safe and needs no tzdata dependency.
EAT = timezone(timedelta(hours=3), "EAT")


def _utcnow():
    """Current moment as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


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

    # Stored as TIMESTAMP WITH TIME ZONE: an exact moment in time,
    # independent of the server's timezone.
    created_at = db.Column(
        db.DateTime(timezone=True),
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

    def _created_at_eat(self):
        """created_at converted to East Africa Time."""
        if self.created_at is None:
            return None

        created_at = self.created_at

        # Treat any naive value (e.g. not yet migrated) as UTC.
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        return created_at.astimezone(EAT)

    def to_dict(self):
        created_at_eat = self._created_at_eat()

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
            # e.g. "2026-10-23T15:50:59+03:00"
            "created_at": (
                created_at_eat.isoformat()
                if created_at_eat
                else None
            ),
        }
