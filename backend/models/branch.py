from datetime import datetime

from extensions import db


class Branch(db.Model):
    __tablename__ = "branches"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    name = db.Column(
        db.String(100),
        nullable=False,
        unique=True
    )

    code = db.Column(
        db.String(30),
        nullable=False,
        unique=True
    )

    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    cashiers = db.relationship(
        "Cashier",
        back_populates="branch"
    )

    stock_items = db.relationship(
        "BranchProductStock",
        back_populates="branch"
    )

    sales = db.relationship(
        "CashierSale",
        back_populates="branch"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "is_active": self.is_active,
            "created_at": (
                self.created_at.isoformat()
                if self.created_at
                else None
            )
        }