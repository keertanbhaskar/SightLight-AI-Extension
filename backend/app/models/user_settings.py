from sqlalchemy import Uuid, Column, DateTime, Integer, Float, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.core.database import Base


class PerceptionMode(str, enum.Enum):
    AUTO = "auto"
    VISION = "vision"
    DOM = "dom"


class Theme(str, enum.Enum):
    DARK = "dark"
    LIGHT = "light"
    SYSTEM = "system"


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    perception_mode = Column(SQLEnum(PerceptionMode), default=PerceptionMode.AUTO, nullable=False)
    confidence_threshold = Column(Float, default=0.75, nullable=False)
    max_steps = Column(Integer, default=15, nullable=False)
    max_runtime = Column(Integer, default=60, nullable=False)
    require_confirmation = Column(Boolean, default=True, nullable=False)
    theme = Column(SQLEnum(Theme), default=Theme.DARK, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="settings")
