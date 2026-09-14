"""Postgres access and migrations. Uses DATABASE_URL; without it (local dev) a Postgres is started in
apps/backend/pgdata via pgserver (pip install pgserver)."""
import functools
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

HERE = Path(__file__).parent


@functools.cache
def url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    import pgserver  # dev only, keeps running in the background between runs
    return pgserver.get_server(HERE / "pgdata", cleanup_mode=None).get_uri()


def connect() -> psycopg.Connection:
    # ponytail: a connection per call; add psycopg_pool when connect time shows up in request latency
    return psycopg.connect(url(), row_factory=dict_row, autocommit=True)


def migrate():
    """Apply migrations/*.sql in name order, each exactly once. The advisory lock stops API and worker racing."""
    with connect() as db:
        db.execute("select pg_advisory_lock(7431)")
        db.execute("create table if not exists schema_migrations"
                   " (name text primary key, applied_at timestamptz not null default now())")
        done = {row["name"] for row in db.execute("select name from schema_migrations")}
        for path in sorted((HERE / "migrations").glob("*.sql")):
            if path.name not in done:
                with db.transaction():
                    db.execute(path.read_text(encoding="utf-8"))
                    db.execute("insert into schema_migrations (name) values (%s)", (path.name,))
