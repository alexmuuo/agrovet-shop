from datetime import datetime

from extensions import db

class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(150), nullable=False)

    category = db.Column(db.String(100), nullable=False)

    description = db.Column(db.Text)

    price = db.Column(db.Numeric(10, 2), nullable=False)

    unit = db.Column(db.String(50), nullable=False)

    stock = db.Column(db.Integer, nullable=False, default=0)

    image = db.Column(db.String(500))

    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "price": float(self.price),
            "unit": self.unit,
            "stock": self.stock,
            "image": self.image,
            "is_active": self.is_active,
        }