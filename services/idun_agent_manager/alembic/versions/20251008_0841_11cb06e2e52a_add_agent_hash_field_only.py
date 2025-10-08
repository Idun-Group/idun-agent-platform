"""add agent hash field only

Revision ID: 11cb06e2e52a
Revises: a8afb561e3b0
Create Date: 2025-10-08 08:41:25.610646+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = '11cb06e2e52a'
down_revision: Union[str, None] = 'a8afb561e3b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
