"""
SQLAlchemy ORM model for administrator accounts.
"""

from datetime import datetime

from sqlalchemy import Integer, String, TIMESTAMP, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AdminUser(Base):
    """
    Represents an administrator who can access
    protected backend endpoints.
    """

    __tablename__ = "admin_users"

    # ----------------------------------------
    # Primary Key
    # ----------------------------------------
    admin_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # ----------------------------------------
    # Login Credentials
    # ----------------------------------------
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # ----------------------------------------
    # Authorization
    # ----------------------------------------
    role: Mapped[str] = mapped_column(
        String(20),
        default="admin",
        nullable=False,
    )

    # ----------------------------------------
    # Metadata
    # ----------------------------------------
    # DB-generated, timezone-aware, matching every other table's created_at
    # (Route, Stop, SegmentCongestionStat) -- this used to be a Python-side
    # `default=datetime.utcnow` on a plain (naive) DateTime, the one column
    # in the schema that didn't follow that pattern.
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )

    # ----------------------------------------
    # Debug Representation
    # ----------------------------------------
    def __repr__(self) -> str:
        return (
            f"AdminUser("
            f"id={self.admin_id}, "
            f"username='{self.username}', "
            f"role='{self.role}')"
        )