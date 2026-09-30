from sqlalchemy import Uuid, Column, DateTime, Integer, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.core.database import Base


class ExecutionState(str, enum.Enum):
    IDLE = "idle"
    OBSERVING = "observing"
    PERCEIVING = "perceiving"
    PLANNING = "planning"
    SAFETY_CHECK = "safety_check"
    ACTING = "acting"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    STOPPED = "stopped"
    ERROR = "error"


class Execution(Base):
    __tablename__ = "executions"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    task_id = Column(Uuid(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    state = Column(SQLEnum(ExecutionState), default=ExecutionState.IDLE, nullable=False)
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    task = relationship("Task", back_populates="executions")
    actions = relationship("Action", back_populates="execution", cascade="all, delete-orphan", lazy="selectin", order_by="Action.created_at")
