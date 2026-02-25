from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Anomaly(Base):
    __tablename__ = "anomalies"

    anomaly_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telemetry_id: Mapped[int] = mapped_column(ForeignKey("telemetry.telemetry_id", ondelete="CASCADE"), nullable=False)
    method_config_id: Mapped[int] = mapped_column(ForeignKey("method_configs.method_config_id"), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    telemetry = relationship("Telemetry", back_populates="anomalies")
    method_config = relationship("MethodConfig", back_populates="anomalies")

    __table_args__ = (
        Index("ix_anomalies_detected_at", "detected_at"),
        Index("ix_anomalies_telemetry_id", "telemetry_id"),
        Index("ix_anomalies_method_config_id", "method_config_id"),
        UniqueConstraint(
            "telemetry_id",
            "method_config_id",
            name="uq_anomalies_telemetry_method_config",
        ),
    )
