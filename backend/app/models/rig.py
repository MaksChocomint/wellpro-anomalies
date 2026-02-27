from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Rig(Base):
    __tablename__ = "rigs"

    rig_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    well_id: Mapped[int] = mapped_column(
        ForeignKey("wells.well_id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str] = mapped_column(String(30), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    # Relations
    well = relationship("Well", back_populates="rigs")

    states = relationship(
        "RigState",
        back_populates="rig",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RigState.started_at",
    )

    method_configs = relationship(
        "MethodConfig",
        back_populates="rig",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # ✅ ВОТ ЭТОГО НЕ ХВАТАЛО
    sensors = relationship(
        "Sensor",
        back_populates="rig",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_rigs_well_id", "well_id"),
        Index("ix_rigs_created_at", "created_at"),
    )