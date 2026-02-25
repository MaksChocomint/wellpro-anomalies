from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Cluster(Base):
    __tablename__ = "clusters"

    cluster_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.field_id", ondelete="CASCADE"), nullable=False)

    field = relationship("Field", back_populates="clusters")
    wells = relationship("Well", back_populates="cluster", cascade="all, delete")

    __table_args__ = (
        Index("ix_clusters_field_id", "field_id"),
        CheckConstraint("number > 0", name="cluster_number_positive_check"),
        UniqueConstraint("field_id", "number", name="uq_clusters_field_number"),
    )
