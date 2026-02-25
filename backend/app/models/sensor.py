from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Sensor(Base):
    __tablename__ = "sensors"

    sensor_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rig_id: Mapped[int] = mapped_column(ForeignKey("rigs.rig_id", ondelete="CASCADE"), nullable=False)
    sensor_type_id: Mapped[int] = mapped_column(ForeignKey("sensor_types.sensor_type_id"), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(50), nullable=False)
    installed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    rig = relationship("Rig", back_populates="sensors")
    sensor_type = relationship("SensorType", back_populates="sensors")
    telemetry = relationship("Telemetry", back_populates="sensor", cascade="all, delete")

    __table_args__ = (
        Index("ix_sensors_rig_id", "rig_id"),
        Index("ix_sensors_sensor_type_id", "sensor_type_id"),
        UniqueConstraint("serial_number", name="uq_sensors_serial_number"),
    )
    
