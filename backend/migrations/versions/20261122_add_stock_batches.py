
"""Add stock batches and POS batch allocations.

Revision ID: 20261122sb01
Revises: f9d197ea83f9
Create Date: 2026-11-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20261122sb01"
down_revision = "f9d197ea83f9"
branch_labels = None
depends_on = None


def upgrade():

    # -------------------------------------------------
    # STOCK BATCHES
    # -------------------------------------------------

    op.create_table(
        "stock_batches",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True
        ),

        sa.Column(
            "reference",
            sa.String(80),
            nullable=True
        ),

        sa.Column(
            "product_id",
            sa.Integer(),
            nullable=False
        ),

        sa.Column(
            "branch_id",
            sa.Integer(),
            nullable=False
        ),

        sa.Column(
            "cashier_id",
            sa.Integer(),
            nullable=False
        ),

        sa.Column(
            "quantity_received",
            sa.Numeric(12, 3),
            nullable=False
        ),

        sa.Column(
            "remaining_quantity",
            sa.Numeric(12, 3),
            nullable=False
        ),

        sa.Column(
            "buying_price",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "selling_price",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "supplier_reference",
            sa.String(150),
            nullable=True
        ),

        sa.Column(
            "notes",
            sa.Text(),
            nullable=True
        ),

        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now()
        ),

        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            ondelete="RESTRICT"
        ),

        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            ondelete="RESTRICT"
        ),

        sa.ForeignKeyConstraint(
            ["cashier_id"],
            ["cashiers.id"],
            ondelete="RESTRICT"
        ),

        sa.CheckConstraint(
            "quantity_received > 0",
            name="ck_stock_batch_received_positive"
        ),

        sa.CheckConstraint(
            "remaining_quantity >= 0",
            name="ck_stock_batch_remaining_nonnegative"
        ),

        sa.CheckConstraint(
            "remaining_quantity <= quantity_received",
            name="ck_stock_batch_remaining_valid"
        ),

        sa.CheckConstraint(
            "buying_price >= 0",
            name="ck_stock_batch_bp_nonnegative"
        ),

        sa.CheckConstraint(
            "selling_price >= 0",
            name="ck_stock_batch_sp_nonnegative"
        ),
    )

    op.create_index(
        "ix_stock_batches_product_id",
        "stock_batches",
        ["product_id"]
    )

    op.create_index(
        "ix_stock_batches_branch_id",
        "stock_batches",
        ["branch_id"]
    )

    op.create_index(
        "ix_stock_batches_cashier_id",
        "stock_batches",
        ["cashier_id"]
    )

    op.create_index(
        "ix_stock_batches_created_at",
        "stock_batches",
        ["created_at"]
    )

    op.create_index(
        "ix_stock_batches_fifo",
        "stock_batches",
        ["branch_id", "product_id", "created_at", "id"]
    )

    op.create_index(
        "ix_stock_batches_reference",
        "stock_batches",
        ["reference"]
    )

    # -------------------------------------------------
    # STOCK BATCH ALLOCATIONS
    # -------------------------------------------------

    op.create_table(
        "stock_batch_allocations",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True
        ),

        sa.Column(
            "batch_id",
            sa.Integer(),
            nullable=False
        ),

        sa.Column(
            "sale_item_id",
            sa.Integer(),
            nullable=False
        ),

        sa.Column(
            "quantity",
            sa.Numeric(12, 3),
            nullable=False
        ),

        sa.Column(
            "buying_price",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "selling_price",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "revenue",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "cost",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "gross_profit",
            sa.Numeric(12, 2),
            nullable=False
        ),

        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now()
        ),

        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["stock_batches.id"],
            ondelete="RESTRICT"
        ),

        sa.ForeignKeyConstraint(
            ["sale_item_id"],
            ["cashier_sale_items.id"],
            ondelete="RESTRICT"
        ),

        sa.CheckConstraint(
            "quantity > 0",
            name="ck_batch_allocation_quantity_positive"
        ),

        sa.CheckConstraint(
            "buying_price >= 0",
            name="ck_batch_allocation_bp_nonnegative"
        ),

        sa.CheckConstraint(
            "selling_price >= 0",
            name="ck_batch_allocation_sp_nonnegative"
        ),

        sa.CheckConstraint(
            "revenue >= 0",
            name="ck_batch_allocation_revenue_nonnegative"
        ),

        sa.CheckConstraint(
            "cost >= 0",
            name="ck_batch_allocation_cost_nonnegative"
        ),
    )

    op.create_index(
        "ix_stock_batch_allocations_batch_id",
        "stock_batch_allocations",
        ["batch_id"]
    )

    op.create_index(
        "ix_stock_batch_allocations_sale_item_id",
        "stock_batch_allocations",
        ["sale_item_id"]
    )


def downgrade():

    op.drop_index(
        "ix_stock_batch_allocations_sale_item_id",
        table_name="stock_batch_allocations"
    )

    op.drop_index(
        "ix_stock_batch_allocations_batch_id",
        table_name="stock_batch_allocations"
    )

    op.drop_table("stock_batch_allocations")

    op.drop_index(
        "ix_stock_batches_reference",
        table_name="stock_batches"
    )

    op.drop_index(
        "ix_stock_batches_fifo",
        table_name="stock_batches"
    )

    op.drop_index(
        "ix_stock_batches_created_at",
        table_name="stock_batches"
    )

    op.drop_index(
        "ix_stock_batches_cashier_id",
        table_name="stock_batches"
    )

    op.drop_index(
        "ix_stock_batches_branch_id",
        table_name="stock_batches"
    )

    op.drop_index(
        "ix_stock_batches_product_id",
        table_name="stock_batches"
    )

    op.drop_table("stock_batches")
