"""

Revision ID: a8afb561e3b0
Revises: d38262ff1942
Create Date: 2025-10-08 08:05:19.034880+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision: str = 'a8afb561e3b0'
down_revision: Union[str, None] = 'd38262ff1942'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
