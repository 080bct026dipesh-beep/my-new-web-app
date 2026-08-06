"""ORM model for `stops`. Columns must stay in sync with
migrations/versions/0001_initial_schema.py -- this file doesn't drive
schema changes (Alembic does), it just gives the app a typed way to
query the table Alembic created.
"""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Stop(Base):
    __tablename__ = "stops"

    stop_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_normalized: Mapped[str] = mapped_column(String(150), nullable=False)
    is_interchange: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Stop {self.stop_id} {self.name!r}>"
