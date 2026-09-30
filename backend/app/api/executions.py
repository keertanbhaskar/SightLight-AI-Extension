from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.schemas.execution import (
    ExecutionCreate,
    ExecutionUpdate,
    ExecutionResponse,
    ExecutionListResponse,
    ActionCreate,
    ActionUpdate,
    ActionResponse,
)
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/executions", tags=["Executions"])


@router.post(
    "/tasks/{task_id}/executions",
    response_model=ExecutionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_execution(
    task_id: UUID,
    execution_data: ExecutionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new execution for a task."""
    execution = await ExecutionService.create_execution(
        db, current_user, task_id, execution_data
    )
    return execution


@router.get("/tasks/{task_id}/executions", response_model=ExecutionListResponse)
async def get_task_executions(
    task_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all executions for a task."""
    executions = await ExecutionService.get_task_executions(db, current_user, task_id)
    return ExecutionListResponse(executions=executions, total=len(executions))


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific execution by ID."""
    execution = await ExecutionService.get_execution_by_id(db, current_user, execution_id)
    return execution


@router.patch("/{execution_id}", response_model=ExecutionResponse)
async def update_execution(
    execution_id: UUID,
    execution_update: ExecutionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an execution."""
    execution = await ExecutionService.update_execution(
        db, current_user, execution_id, execution_update
    )
    return execution


@router.post(
    "/{execution_id}/actions",
    response_model=ActionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_action(
    execution_id: UUID,
    action_data: ActionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new action for an execution."""
    action = await ExecutionService.create_action(
        db, current_user, execution_id, action_data
    )
    return action


@router.patch("/actions/{action_id}", response_model=ActionResponse)
async def update_action(
    action_id: UUID,
    action_update: ActionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an action."""
    action = await ExecutionService.update_action(db, current_user, action_id, action_update)
    return action
