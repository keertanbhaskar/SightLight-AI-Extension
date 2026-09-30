from sqlalchemy import Uuid, Column, String, DateTime, ForeignKey, Enum as SQLEnum, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.core.database import Base


class ActionType(str, enum.Enum):
    CLICK = "click"
    TYPE = "type"
    SCROLL = "scroll"
    OBSERVE = "observe"
    WAIT = "wait"
    NAVIGATE = "navigate"
    PRESS = "press"
    BACK = "back"
    RELOAD = "reload"
    FIND = "find"


class ActionStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


class PerceptionSource(str, enum.Enum):
    VISION = "vision"
    DOM = "dom"
    HYBRID = "hybrid"


class Action(Base):
    __tablename__ = "actions"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    execution_id = Column(Uuid(as_uuid=True), ForeignKey("executions.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(SQLEnum(ActionType), nullable=False)
    target_label = Column(String(500), nullable=True)
    target_confidence = Column(Float, nullable=True)
    perception_source = Column(SQLEnum(PerceptionSource), nullable=True)
    status = Column(SQLEnum(ActionStatus), default=ActionStatus.PENDING, nullable=False)
    # "metadata" is reserved by SQLAlchemy Declarative; keep the DB column name, rename the attribute.
    meta = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    execution = relationship("Execution", back_populates="actions")
