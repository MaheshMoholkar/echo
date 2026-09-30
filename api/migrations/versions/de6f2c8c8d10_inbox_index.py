"""inbox index: one organization's conversations by latest activity

Revision ID: de6f2c8c8d10
Revises: 43c8c9ad11df
"""

from collections.abc import Sequence

from alembic import op

revision: str = "de6f2c8c8d10"
down_revision: str | Sequence[str] | None = "43c8c9ad11df"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_conversations_org_updated",
        "conversations",
        ["organization_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_org_updated", table_name="conversations")
