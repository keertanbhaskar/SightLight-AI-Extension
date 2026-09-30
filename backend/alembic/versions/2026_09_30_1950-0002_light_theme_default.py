"""Use the light dashboard theme by default."""
from typing import Sequence, Union

from alembic import op


revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE user_settings SET theme = 'LIGHT' WHERE theme = 'DARK'")


def downgrade() -> None:
    pass