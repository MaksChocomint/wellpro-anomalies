from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Company(Base):
    __tablename__ = "companies"

    company_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    fields = relationship("Field", back_populates="company", cascade="all, delete")

    __table_args__ = (
        CheckConstraint("length(name) > 2", name="company_name_length_check"),
        UniqueConstraint("name", name="uq_companies_name"),
    )
