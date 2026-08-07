import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import routes, routing, stops
from app.db.session import SessionLocal
from app.routing.graph_builder import build_graph

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.graph = None
    db = SessionLocal()
    try:
        app.state.graph = build_graph(db)
        logger.info(
            "Routing graph built: %d stops, %d edges",
            app.state.graph.number_of_nodes(),
            app.state.graph.number_of_edges(),
        )
    except Exception:
        logger.exception("Failed to build routing graph at startup")
    finally:
        db.close()

    yield


app = FastAPI(
    title="Kathmandu Bus Route Finder API",
    description="Origin-destination bus route search for the Kathmandu Valley.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/admin/rebuild-graph")
def rebuild_graph():
    """Rebuild the routing graph on demand — call after any data change
    instead of restarting the whole API."""
    db = SessionLocal()
    try:
        app.state.graph = build_graph(db)
        return {
            "status": "ok",
            "stops": app.state.graph.number_of_nodes(),
            "edges": app.state.graph.number_of_edges(),
        }
    finally:
        db.close()


app.include_router(stops.router)
app.include_router(routes.router)
app.include_router(routing.router)