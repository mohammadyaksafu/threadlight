"""Alembic runs as the database owner (ADMIN_DATABASE_URL); the app itself never does."""

from alembic import context
from sqlalchemy import create_engine

from backend.db.session import sa_url
from backend.config import settings

engine = create_engine(sa_url(settings().admin_database_url))
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()
