"""ORM model for `routes`. Kept in sync with
migrations/versions/0001_initial_schema.py.
"""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (CheckConstraint("tier IN (1,2,3)", name="ck_routes_tier"),)

    route_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_number: Mapped[str] = mapped_column(String(20), nullable=False)
    route_name: Mapped[str] = mapped_column(String(150), nullable=False)
    operator: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tier: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Route {self.route_id} {self.route_number!r}>"
