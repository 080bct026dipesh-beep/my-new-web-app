from fastapi import FastAPI

from app.api import route_finder, routes, stops

app = FastAPI(
    title="Kathmandu Bus Route Finder API",
    description="Origin-destination bus route search for the Kathmandu Valley.",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(stops.router)
app.include_router(routes.router)
app.include_router(route_finder.router)