from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DetectionMethod(Base):
    __tablename__ = "detection_methods"

    method_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    configs = relationship("MethodConfig", back_populates="method")

    __table_args__ = (
        UniqueConstraint("name", name="uq_detection_methods_name"),
    )
