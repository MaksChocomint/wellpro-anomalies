from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SensorType(Base):
    __tablename__ = "sensor_types"

    sensor_type_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)

    sensors = relationship("Sensor", back_populates="sensor_type")

    __table_args__ = (
        UniqueConstraint("name", name="uq_sensor_types_name"),
    )
