"""timestamps use clock_timestamp() instead of now()

Revision ID: c8727d47c818
Revises: de6f2c8c8d10

now() is the start time of the transaction, so every row written in one
transaction got the same timestamp and sorted arbitrarily. Written by hand:
autogenerate doesn't compare server defaults.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8727d47c818"
down_revision: str | Sequence[str] | None = "de6f2c8c8d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = [
    ("contact_sessions", "created_at"),
    ("conversations", "created_at"),
    ("conversations", "updated_at"),
    ("messages", "created_at"),
    ("documents", "created_at"),
]


def upgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(table, column, server_default=sa.text("clock_timestamp()"))


def downgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(table, column, server_default=sa.text("now()"))
