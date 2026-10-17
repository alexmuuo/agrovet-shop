import uuid
from datetime import datetime

from extensions import db


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
        default=lambda: (
            f"POS-{uuid.uuid4().hex[:12].upper()}"
        )
    )

    branch_id = db.Column(
        db.Integer,
        db.ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False
    )

    cashier_id = db.Column(
        db.Integer,
        db.ForeignKey("cashiers.id", ondelete="RESTRICT"),
        nullable=False
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
        default=datetime.utcnow
    )

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
            "total": (
                float(self.total)
                if self.total is not None
                else 0.0
            ),
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
        nullable=False
    )

    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False
    )

    quantity = db.Column(
        db.Integer,
        nullable=False
    )

    price = db.Column(
        db.Numeric(10, 2),
        nullable=False
    )

    buying_price = db.Column(
        db.Numeric(10, 2),
        nullable=True
    )

    sale = db.relationship(
        "CashierSale",
        back_populates="items"
    )

    product = db.relationship(
        "Product"
    )

    __table_args__ = (
        db.CheckConstraint(
            "quantity > 0",
            name="ck_cashier_sale_item_quantity_positive"
        ),
        db.CheckConstraint(
            "price >= 0",
            name="ck_cashier_sale_item_price_nonnegative"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "sale_id": self.sale_id,
            "product_id": self.product_id,
            "product_name": (
                self.product.name
                if self.product
                else None
            ),
            "quantity": self.quantity,
            "price": float(self.price),
            "buying_price": (
                float(self.buying_price)
                if self.buying_price is not None
                else None
            ),
            "subtotal": float(
                self.price * self.quantity
            ),
            "gross_profit": (
                float(
                    (self.price - self.buying_price)
                    * self.quantity
                )
                if self.buying_price is not None
                else None
            )
        }