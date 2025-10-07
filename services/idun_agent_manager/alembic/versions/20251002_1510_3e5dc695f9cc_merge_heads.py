"""merge heads

Revision ID: 3e5dc695f9cc
Revises: 53db7665bf0c, 1c3d9f2f7a10
Create Date: 2025-10-02 15:10:17.640412+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = '3e5dc695f9cc'
down_revision: Union[str, None] = ('53db7665bf0c', '1c3d9f2f7a10')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
