from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Telemetry(Base):
    __tablename__ = "telemetry"

    telemetry_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.sensor_id", ondelete="CASCADE"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    sensor = relationship("Sensor", back_populates="telemetry")
    anomalies = relationship("Anomaly", back_populates="telemetry", cascade="all, delete")

    __table_args__ = (
        Index("ix_telemetry_sensor_timestamp", "sensor_id", "timestamp"),
        Index("ix_telemetry_timestamp", "timestamp"),
    )
