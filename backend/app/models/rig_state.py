from datetime import datetime
from enum import Enum

from sqlalchemy import CheckConstraint, DateTime, Enum as SQLEnum, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RigStateName(str, Enum):
    DRILLING = "drilling"
    IDLE = "idle"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"
    DECOMMISSIONED = "decommissioned"


class RigState(Base):
    __tablename__ = "rig_states"

    rig_state_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rig_id: Mapped[int] = mapped_column(ForeignKey("rigs.rig_id", ondelete="CASCADE"), nullable=False)
    state_name: Mapped[RigStateName] = mapped_column(
        SQLEnum(RigStateName, name="rig_state_name_enum"),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    rig = relationship("Rig", back_populates="states")

    __table_args__ = (
        Index("ix_rig_states_rig_id", "rig_id"),
        Index("ix_rig_states_started_at", "started_at"),
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="rig_state_dates_check"
        ),
    )


