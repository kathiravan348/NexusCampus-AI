"""Shared SQLAlchemy declarative base and column helpers. Python attributes and columns are snake_case;
JSON (API) names stay camelCase in the Pydantic schemas.
"""

from datetime import datetime

from sqlalchemy import DateTime, MetaData, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


ID_LENGTH = 128


def id_column(*, primary_key: bool = False) -> Mapped[str]:
    return mapped_column(String(ID_LENGTH), primary_key=primary_key)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
