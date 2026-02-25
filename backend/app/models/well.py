from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Well(Base):
    __tablename__ = "wells"

    well_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("clusters.cluster_id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    depth_target: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    cluster = relationship("Cluster", back_populates="wells")
    rigs = relationship("Rig", back_populates="well", cascade="all, delete")

    __table_args__ = (
        Index("ix_wells_cluster_id", "cluster_id"),
        Index("ix_wells_status", "status"),
        CheckConstraint("depth_target > 0", name="well_depth_positive_check"),
        CheckConstraint(
            "completed_at IS NULL OR completed_at >= started_at",
            name="well_dates_check",
        ),
    )



