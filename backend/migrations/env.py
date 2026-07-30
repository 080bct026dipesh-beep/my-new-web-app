import os
from logging.config import fileConfig
from app.models.base import Base
from sqlalchemy import engine_from_config, pool
from alembic import context

from dotenv import load_dotenv

# 👇 load .env
load_dotenv()

# this is the Alembic Config object
config = context.config

# 👇 override DB URL from .env
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise ValueError("DATABASE_URL is not set in .env")

config.set_main_option("sqlalchemy.url", database_url)

# logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 👇 import your models here
from app.models import Base  # adjust if needed

target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
