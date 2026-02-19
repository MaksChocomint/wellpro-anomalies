from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RigState(Base):
    __tablename__ = "rig_states"

    rig_state_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rig_id: Mapped[int] = mapped_column(ForeignKey("rigs.rig_id", ondelete="CASCADE"), nullable=False)
    state_name: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    rig = relationship("Rig", back_populates="states")
