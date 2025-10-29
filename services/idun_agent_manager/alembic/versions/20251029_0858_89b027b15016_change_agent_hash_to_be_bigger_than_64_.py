"""change agent_hash to be bigger than 64 chars (hash + idun prefix is more than 64)

Revision ID: 89b027b15016
Revises: c61a1639e45a
Create Date: 2025-10-29 08:58:01.574895+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = '89b027b15016'
down_revision: Union[str, None] = 'c61a1639e45a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Increase agent_hash column length from 64 to 128 to accommodate API key prefix
    op.alter_column('managed_agents', 'agent_hash', type_=sa.String(128))


def downgrade() -> None:
    # Revert agent_hash column length back to 64
    op.alter_column('managed_agents', 'agent_hash', type_=sa.String(64))
