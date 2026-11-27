"""Add batch cost provenance and safely reconcile partially applied schema.

Revision ID: 20261127br01
Revises: 20261122sb01
Create Date: 2026-11-27

Some live databases already contain the restoration audit columns from a
manual/partial rollout. Inspect the live schema and add only missing columns
so this migration can safely finish that rollout without duplicate-column
errors or dropping existing restoration history.
"""

from alembic import op
import sqlalchemy as sa


revision = "20261127br01"
down_revision = "20261122sb01"
branch_labels = None
depends_on = None


def _column_names(table_name):
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table_name):
        raise RuntimeError(
            f"Required table public.{table_name} does not exist. "
            "Do not run this migration until the batch tables are present."
        )
    return {
        column["name"]
        for column in inspector.get_columns(table_name)
    }


def _index_names(table_name):
    inspector = sa.inspect(op.get_bind())
    return {
        index["name"]
        for index in inspector.get_indexes(table_name)
    }


def upgrade():
    allocation_columns = _column_names("stock_batch_allocations")
    batch_columns = _column_names("stock_batches")

    # These restoration columns may already exist on a partially upgraded
    # installation. Add only what is missing; never reset existing values.
    if "is_restored" not in allocation_columns:
        op.add_column(
            "stock_batch_allocations",
            sa.Column(
                "is_restored",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    if "restored_at" not in allocation_columns:
        op.add_column(
            "stock_batch_allocations",
            sa.Column("restored_at", sa.DateTime(), nullable=True),
        )

    if "restoration_reference" not in allocation_columns:
        op.add_column(
            "stock_batch_allocations",
            sa.Column(
                "restoration_reference",
                sa.String(length=100),
                nullable=True,
            ),
        )

    # Required by the current FIFO sale allocator and historical reporting.
    # Existing batches/allocations have explicit recorded BP values, so the
    # compatibility default marks those existing records as known.
    if "cost_is_known" not in allocation_columns:
        op.add_column(
            "stock_batch_allocations",
            sa.Column(
                "cost_is_known",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )

    if "cost_is_known" not in batch_columns:
        op.add_column(
            "stock_batches",
            sa.Column(
                "cost_is_known",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )

    if (
        "is_restored" in _column_names("stock_batch_allocations")
        and "ix_stock_batch_allocations_is_restored"
        not in _index_names("stock_batch_allocations")
    ):
        op.create_index(
            "ix_stock_batch_allocations_is_restored",
            "stock_batch_allocations",
            ["is_restored"],
        )


def downgrade():
    # Intentionally non-destructive. This migration repairs databases that
    # may have had some of these columns added manually. Automatically
    # dropping them could destroy live restoration/cost provenance data.
    pass
