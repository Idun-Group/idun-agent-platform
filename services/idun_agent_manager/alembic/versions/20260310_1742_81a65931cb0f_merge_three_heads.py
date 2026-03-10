"""merge_three_heads

Revision ID: 81a65931cb0f
Revises: a50bb3f44ec7, c6d7e8f9a0b1, d3e4f5a6b7c8
Create Date: 2026-03-10 17:42:46.872998+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = '81a65931cb0f'
down_revision: Union[str, None] = ('a50bb3f44ec7', 'c6d7e8f9a0b1', 'd3e4f5a6b7c8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
