from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List, Dict, Any

from app.models.execution import ExecutionState
from app.models.action import ActionType, ActionStatus, PerceptionSource


class ExecutionCreate(BaseModel):
    state: ExecutionState = ExecutionState.IDLE


class ExecutionUpdate(BaseModel):
    state: Optional[ExecutionState] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    error_message: Optional[str] = None


class ActionCreate(BaseModel):
    action_type: ActionType
    target_label: Optional[str] = None
    target_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    perception_source: Optional[PerceptionSource] = None
    status: ActionStatus = ActionStatus.PENDING
    metadata: Optional[Dict[str, Any]] = None


class ActionUpdate(BaseModel):
    status: Optional[ActionStatus] = None
    metadata: Optional[Dict[str, Any]] = None


class ActionResponse(BaseModel):
    id: UUID
    execution_id: UUID
    action_type: ActionType
    target_label: Optional[str]
    target_confidence: Optional[float]
    perception_source: Optional[PerceptionSource]
    status: ActionStatus
    # ORM attribute is `meta` ("metadata" is reserved by SQLAlchemy); the API keeps the public name.
    metadata: Optional[Dict[str, Any]] = Field(default=None, validation_alias="meta")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ExecutionResponse(BaseModel):
    id: UUID
    task_id: UUID
    state: ExecutionState
    started_at: datetime
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    actions: List[ActionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ExecutionListResponse(BaseModel):
    executions: List[ExecutionResponse]
    total: int
