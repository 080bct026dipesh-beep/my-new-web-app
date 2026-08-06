"""Centralized app configuration.

Everything the app reads from the environment goes through this
module so there's exactly one place that knows about env var names
and defaults.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"

    # Matches docker-compose.yml's `db` service so local dev works
    # out of the box without a .env file.
    database_url: str = "postgresql://ktm_bus:ktm_bus_dev@localhost:5432/ktm_bus_route_finder"

    # Comma-separated list of allowed origins for the Next.js frontend.
    cors_origins: str = "http://localhost:3000"

    # Shared-secret used to protect the /api/admin endpoints. Must be
    # overridden in .env for anything beyond local dev.
    admin_api_key: str = "dev-only-change-me"

    # Radius (metres) used by "nearest stop" search when the caller
    # doesn't specify one.
    default_nearest_stop_radius_m: int = 500

    # Reserved for future per-user auth; not used by anything yet.
    jwt_secret: str = "change_me_in_production"

    # Reserved for road-network geometry lookups (frontend rendering);
    # not called from the backend yet.
    osrm_base_url: str = "http://localhost:5000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
