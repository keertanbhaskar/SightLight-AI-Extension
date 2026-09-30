from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.models.task import TaskStatus
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, TaskListResponse
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new task."""
    task = await TaskService.create_task(db, current_user, task_data)
    return task


@router.get("", response_model=TaskListResponse)
async def get_tasks(
    status_filter: Optional[TaskStatus] = Query(None, description="Filter by task status"),
    search: Optional[str] = Query(None, description="Search in task instructions"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all tasks for the current user with optional filtering."""
    tasks, total = await TaskService.get_user_tasks(
        db, current_user, status_filter, search, page, page_size
    )
    return TaskListResponse(tasks=tasks, total=total, page=page, page_size=page_size)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific task by ID."""
    task = await TaskService.get_task_by_id(db, current_user, task_id)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    task_update: TaskUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    task = await TaskService.update_task(db, current_user, task_id, task_update)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task."""
    await TaskService.delete_task(db, current_user, task_id)
    return None
