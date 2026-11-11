"""orders are approved by the system and assigned to the least loaded worker

Revision ID: a76ef0d462f1
Revises: f57491a55874
Create Date: 2026-11-11 16:32:41.124049

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a76ef0d462f1'
down_revision: Union[str, Sequence[str], None] = 'f57491a55874'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('orders', sa.Column('assigned_to_id', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_orders_assigned_to_id'), 'orders', ['assigned_to_id'], unique=False)
    op.create_foreign_key('orders_assigned_to_id_fkey', 'orders', 'employees', ['assigned_to_id'], ['id'],
                          ondelete='RESTRICT')
    # Automatic approval has no manager: approved_at is required instead of approved_by.
    op.drop_constraint('chk_orders_approved_fields', 'orders', type_='check')
    op.create_check_constraint('chk_orders_approved_fields', 'orders',
                               "status NOT IN ('APPROVED', 'SHIPPED') OR approved_at IS NOT NULL")
    # Waiting orders are approved and existing ones assigned by the app at start (see main.py lifespan).


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('chk_orders_approved_fields', 'orders', type_='check')
    op.create_check_constraint('chk_orders_approved_fields', 'orders',
                               "status NOT IN ('APPROVED', 'SHIPPED') OR approved_by_id IS NOT NULL")
    op.drop_constraint('orders_assigned_to_id_fkey', 'orders', type_='foreignkey')
    op.drop_index(op.f('ix_orders_assigned_to_id'), table_name='orders')
    op.drop_column('orders', 'assigned_at')
    op.drop_column('orders', 'assigned_to_id')
