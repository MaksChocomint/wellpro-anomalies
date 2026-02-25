from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Field(Base):
    __tablename__ = "fields"

    field_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.company_id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(100), nullable=False)

    company = relationship("Company", back_populates="fields")
    clusters = relationship("Cluster", back_populates="field", cascade="all, delete")

    __table_args__ = (
        Index("ix_fields_company_id", "company_id"),
        Index("ix_fields_name", "name"),
        UniqueConstraint("company_id", "name", name="uq_fields_company_name"),
    )
