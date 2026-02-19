from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MethodConfig(Base):
    __tablename__ = "method_configs"

    method_config_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rig_id: Mapped[int] = mapped_column(ForeignKey("rigs.rig_id", ondelete="CASCADE"), nullable=False)
    method_id: Mapped[int] = mapped_column(ForeignKey("detection_methods.method_id"), nullable=False)
    window_size: Mapped[int] = mapped_column(Integer, nullable=False)
    threshold: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    rig = relationship("Rig", back_populates="method_configs")
    method = relationship("DetectionMethod", back_populates="configs")
    anomalies = relationship("Anomaly", back_populates="method_config")
