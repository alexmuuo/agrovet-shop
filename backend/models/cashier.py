from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


class Cashier(db.Model):
    __tablename__ = "cashiers"

    # Primary key
    id = db.Column(
        db.Integer,
        primary_key=True,
        autoincrement=True
    )

    # Account information
    username = db.Column(
        db.String(80),
        nullable=False,
        unique=True,
        index=True
    )

    full_name = db.Column(
        db.String(150),
        nullable=False
    )

    # Store hashed passwords, never plain-text passwords
    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    # Account status
    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )

    # Account creation timestamp
    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    # --------------------------------------------------
    # PASSWORD MANAGEMENT
    # --------------------------------------------------

    def set_password(self, password):
        """Hash and save the cashier's password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Verify a supplied password."""
        return check_password_hash(
            self.password_hash,
            password
        )

    # --------------------------------------------------
    # SERIALIZATION
    # --------------------------------------------------

    def to_dict(self):
        """Return safe cashier information."""
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "is_active": self.is_active,
            "created_at": (
                self.created_at.isoformat()
                if self.created_at
                else None
            )
        }

    def __repr__(self):
        return f"<Cashier {self.username}>"