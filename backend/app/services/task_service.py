from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from fastapi import HTTPException, status
from typing import Optional, List
from uuid import UUID

from app.models.user import User
from app.models.task import Task, TaskStatus
from app.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    """Service for task management operations."""

    @staticmethod
    async def create_task(db: AsyncSession, user: User, task_data: TaskCreate) -> Task:
        """Create a new task for a user."""
        new_task = Task(
            user_id=user.id,
            instruction=task_data.instruction,
            status=TaskStatus.PENDING,
        )

        db.add(new_task)
        await db.commit()
        await db.refresh(new_task)

        return new_task

    @staticmethod
    async def get_task_by_id(db: AsyncSession, user: User, task_id: UUID) -> Task:
        """Get a specific task by ID for the authenticated user."""
        result = await db.execute(
            select(Task).filter(Task.id == task_id, Task.user_id == user.id)
        )
        task = result.scalar_one_or_none()

        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        return task

    @staticmethod
    async def get_user_tasks(
        db: AsyncSession,
        user: User,
        status_filter: Optional[TaskStatus] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[Task], int]:
        """Get tasks for a user with optional filtering and pagination."""
        query = select(Task).filter(Task.user_id == user.id)

        # Apply status filter
        if status_filter:
            query = query.filter(Task.status == status_filter)

        # Apply search filter
        if search:
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = query.filter(Task.instruction.ilike(f"%{escaped}%", escape="\\"))

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        # Apply pagination and ordering
        query = query.order_by(desc(Task.created_at))
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        tasks = result.scalars().all()

        return list(tasks), total

    @staticmethod
    async def update_task(
        db: AsyncSession, user: User, task_id: UUID, task_update: TaskUpdate
    ) -> Task:
        """Update a task."""
        task = await TaskService.get_task_by_id(db, user, task_id)

        # Update fields
        if task_update.status is not None:
            task.status = task_update.status
        if task_update.started_at is not None:
            task.started_at = task_update.started_at
        if task_update.completed_at is not None:
            task.completed_at = task_update.completed_at
        if task_update.duration_ms is not None:
            task.duration_ms = task_update.duration_ms
        if task_update.steps_count is not None:
            task.steps_count = task_update.steps_count

        await db.commit()
        await db.refresh(task)

        return task

    @staticmethod
    async def delete_task(db: AsyncSession, user: User, task_id: UUID) -> None:
        """Delete a task."""
        task = await TaskService.get_task_by_id(db, user, task_id)

        await db.delete(task)
        await db.commit()
