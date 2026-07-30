from fastapi import FastAPI

app = FastAPI(
    title="Kathmandu Bus Route Finder API",
    description="Origin-destination bus route search for the Kathmandu Valley.",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Routers will be included here as they're built, e.g.:
# from app.api import routes, stops
# app.include_router(routes.router, prefix="/api/route", tags=["route"])
# app.include_router(stops.router, prefix="/api/stops", tags=["stops"])
