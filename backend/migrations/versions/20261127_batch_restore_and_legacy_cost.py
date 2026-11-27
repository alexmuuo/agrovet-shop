"""Add allocation restoration audit fields and legacy cost provenance.

Revision ID: 20261127br01
Revises: 20261122sb01
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa


revision = "20261127br01"
down_revision = "20261122sb01"
branch_labels = None
depends_on = None


def upgrade():
    # Existing allocations predate restoration tracking. They represent
    # consumed stock, so default them to not restored.
    op.add_column(
        "stock_batch_allocations",
        sa.Column(
            "is_restored",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "stock_batch_allocations",
        sa.Column("restored_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "stock_batch_allocations",
        sa.Column("restoration_reference", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "stock_batch_allocations",
        sa.Column(
            "cost_is_known",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "stock_batches",
        sa.Column(
            "cost_is_known",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.create_index(
        "ix_stock_batch_allocations_is_restored",
        "stock_batch_allocations",
        ["is_restored"],
    )


def downgrade():
    op.drop_index(
        "ix_stock_batch_allocations_is_restored",
        table_name="stock_batch_allocations",
    )
    op.drop_column("stock_batches", "cost_is_known")
    op.drop_column("stock_batch_allocations", "cost_is_known")
    op.drop_column("stock_batch_allocations", "restoration_reference")
    op.drop_column("stock_batch_allocations", "restored_at")
    op.drop_column("stock_batch_allocations", "is_restored")
