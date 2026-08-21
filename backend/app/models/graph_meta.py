from sqlalchemy import CheckConstraint, Column, Integer, SmallInteger

from .base import Base


class GraphMeta(Base):
    """Single-row table used to invalidate the in-memory routing graph.

    The graph built by app/routing/graph_builder.py is cached per-process
    (a module-level global). With more than one worker/replica, a write
    that changes graph shape (new route_stops row, a route flipped to
    active/pending_release, etc.) only refreshes the cache in whichever
    process handled that request -- every other worker keeps serving the
    stale graph indefinitely.

    `version` is bumped by app/db/queries.py::bump_graph_version() at the
    end of every admin write that affects the graph. Every call to
    get_cached_graph() does one cheap indexed single-row SELECT to compare
    the DB's version against what it last built from -- if they differ,
    it rebuilds. This makes staleness self-healing across all processes
    without needing a shared cache like Redis: each worker notices on its
    very next request, at the cost of one extra tiny query per request.
    """

    __tablename__ = "graph_meta"

    id = Column(SmallInteger, primary_key=True)
    version = Column(Integer, nullable=False, server_default="1")

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_graph_meta_singleton"),
    )
