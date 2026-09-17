"""Postgres access and migrations. Uses DATABASE_URL; without it (local dev) a Postgres is started in
apps/backend/pgdata via pgserver (pip install pgserver)."""
import functools
import os
import threading
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

HERE = Path(__file__).parent
_starting = threading.RLock()  # reentrant: connect() holds it while creating the pool and calls url() inside
_pool = None


def url() -> str:
    with _starting:  # API and worker threads asking at once would otherwise both try to start the dev server
        return _url()


@functools.cache
def _url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    import pgserver  # dev only, keeps running in the background between runs
    return pgserver.get_server(HERE / "pgdata", cleanup_mode=None).get_uri()


def connect() -> psycopg.Connection:
    """A pooled connection: the pool (lazily created) saves the TCP + auth round trip per query, which adds up
    over the several queries a request makes. Connections auto-commit; transactions are explicit (c.transaction())."""
    global _pool
    if _pool is None:
        with _starting:
            if _pool is None:
                _pool = ConnectionPool(url(), min_size=1, max_size=8, open=True,
                                       kwargs={"row_factory": dict_row, "autocommit": True})
    return _pool.connection()


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
