from datetime import datetime

from extensions import db

class CashierSaleAudit(db.Model):
 """
Immutable audit records for administrator changes to POS sales.


Records the administrator, reason, and before/after snapshots
without deleting the original sale or its payment history.
"""

__tablename__ = "cashier_sale_audits"

id = db.Column(
    db.Integer,
    primary_key=True,
    autoincrement=True,
)

sale_id = db.Column(
    db.Integer,
    db.ForeignKey(
        "cashier_sales.id",
        ondelete="RESTRICT",
    ),
    nullable=False,
    index=True,
)

admin_username = db.Column(
    db.String(100),
    nullable=False,
    index=True,
)

action = db.Column(
    db.String(20),
    nullable=False,
)

reason = db.Column(
    db.Text,
    nullable=False,
)

before_data = db.Column(
    db.JSON,
    nullable=False,
)

after_data = db.Column(
    db.JSON,
    nullable=False,
)

created_at = db.Column(
    db.DateTime,
    nullable=False,
    default=datetime.utcnow,
    index=True,
)

sale = db.relationship(
    "CashierSale",
    foreign_keys=[sale_id],
)

__table_args__ = (
    db.CheckConstraint(
        "action IN ('edited', 'voided')",
        name="ck_cashier_sale_audit_action",
    ),
)

def to_dict(self):
    return {
        "id": self.id,
        "sale_id": self.sale_id,
        "admin_username": self.admin_username,
        "action": self.action,
        "reason": self.reason,
        "before_data": self.before_data,
        "after_data": self.after_data,
        "created_at": (
            self.created_at.isoformat()
            if self.created_at
            else None
        ),
    }

