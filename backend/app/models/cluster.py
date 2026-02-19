from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Cluster(Base):
    __tablename__ = "clusters"

    cluster_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.field_id", ondelete="CASCADE"), nullable=False)

    field = relationship("Field", back_populates="clusters")
    wells = relationship("Well", back_populates="cluster", cascade="all, delete")
