from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from typing import List
from uuid import UUID

from app.models.user import User
from app.models.task import Task
from app.models.execution import Execution
from app.models.action import Action
from app.schemas.execution import ExecutionCreate, ExecutionUpdate, ActionCreate, ActionUpdate
from app.services.task_service import TaskService


class ExecutionService:
    """Service for execution and action management."""

    @staticmethod
    async def create_execution(
        db: AsyncSession, user: User, task_id: UUID, execution_data: ExecutionCreate
    ) -> Execution:
        """Create a new execution for a task."""
        # Verify task exists and belongs to user
        await TaskService.get_task_by_id(db, user, task_id)

        new_execution = Execution(
            task_id=task_id,
            state=execution_data.state,
        )

        db.add(new_execution)
        await db.commit()
        await db.refresh(new_execution)

        return new_execution

    @staticmethod
    async def get_execution_by_id(
        db: AsyncSession, user: User, execution_id: UUID
    ) -> Execution:
        """Get a specific execution with actions."""
        result = await db.execute(
            select(Execution)
            .options(selectinload(Execution.actions))
            .join(Task)
            .filter(Execution.id == execution_id, Task.user_id == user.id)
        )
        execution = result.scalar_one_or_none()

        if not execution:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Execution not found",
            )

        return execution

    @staticmethod
    async def get_task_executions(
        db: AsyncSession, user: User, task_id: UUID
    ) -> List[Execution]:
        """Get all executions for a task."""
        # Verify task exists and belongs to user
        await TaskService.get_task_by_id(db, user, task_id)

        result = await db.execute(
            select(Execution)
            .options(selectinload(Execution.actions))
            .filter(Execution.task_id == task_id)
            .order_by(Execution.created_at.desc())
        )
        executions = result.scalars().all()

        return list(executions)

    @staticmethod
    async def update_execution(
        db: AsyncSession, user: User, execution_id: UUID, execution_update: ExecutionUpdate
    ) -> Execution:
        """Update an execution."""
        execution = await ExecutionService.get_execution_by_id(db, user, execution_id)

        # Update fields
        if execution_update.state is not None:
            execution.state = execution_update.state
        if execution_update.completed_at is not None:
            execution.completed_at = execution_update.completed_at
        if execution_update.duration_ms is not None:
            execution.duration_ms = execution_update.duration_ms
        if execution_update.error_message is not None:
            execution.error_message = execution_update.error_message

        await db.commit()
        await db.refresh(execution)

        return execution

    @staticmethod
    async def create_action(
        db: AsyncSession, user: User, execution_id: UUID, action_data: ActionCreate
    ) -> Action:
        """Create a new action for an execution."""
        # Verify execution exists and belongs to user
        await ExecutionService.get_execution_by_id(db, user, execution_id)

        new_action = Action(
            execution_id=execution_id,
            action_type=action_data.action_type,
            target_label=action_data.target_label,
            target_confidence=action_data.target_confidence,
            perception_source=action_data.perception_source,
            status=action_data.status,
            meta=action_data.metadata,
        )

        db.add(new_action)
        await db.commit()
        await db.refresh(new_action)

        return new_action

    @staticmethod
    async def update_action(
        db: AsyncSession, user: User, action_id: UUID, action_update: ActionUpdate
    ) -> Action:
        """Update an action."""
        result = await db.execute(
            select(Action)
            .join(Execution)
            .join(Task)
            .filter(Action.id == action_id, Task.user_id == user.id)
        )
        action = result.scalar_one_or_none()

        if not action:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Action not found",
            )

        # Update fields
        if action_update.status is not None:
            action.status = action_update.status
        if action_update.metadata is not None:
            action.meta = action_update.metadata

        await db.commit()
        await db.refresh(action)

        return action
