from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List

from app.models.task import TaskStatus


class TaskCreate(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=1000)


class TaskUpdate(BaseModel):
    status: Optional[TaskStatus] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    steps_count: Optional[int] = None


class TaskResponse(BaseModel):
    id: UUID
    user_id: UUID
    instruction: str
    status: TaskStatus
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    steps_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    tasks: List[TaskResponse]
    total: int
    page: int
    page_size: int
