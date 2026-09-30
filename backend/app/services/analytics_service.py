from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from datetime import datetime, timedelta
from typing import List

from app.models.user import User
from app.models.task import Task, TaskStatus
from app.models.execution import Execution
from app.models.action import Action, ActionStatus, PerceptionSource
from app.schemas.analytics import (
    OverviewMetrics,
    TasksPerDay,
    PerceptionDistribution,
    ActionDistribution,
)


class AnalyticsService:
    """Service for analytics and metrics."""

    @staticmethod
    async def get_overview_metrics(db: AsyncSession, user: User) -> OverviewMetrics:
        """Get overview metrics for user's tasks."""
        # Total tasks
        total_result = await db.execute(
            select(func.count(Task.id)).filter(Task.user_id == user.id)
        )
        total_tasks = total_result.scalar_one() or 0

        # Completed tasks
        completed_result = await db.execute(
            select(func.count(Task.id)).filter(
                Task.user_id == user.id, Task.status == TaskStatus.COMPLETED
            )
        )
        completed_tasks = completed_result.scalar_one() or 0

        # Failed tasks
        failed_result = await db.execute(
            select(func.count(Task.id)).filter(
                Task.user_id == user.id, Task.status == TaskStatus.FAILED
            )
        )
        failed_tasks = failed_result.scalar_one() or 0

        # Success rate
        success_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

        # Average execution time (only completed tasks)
        avg_time_result = await db.execute(
            select(func.avg(Task.duration_ms)).filter(
                Task.user_id == user.id,
                Task.status == TaskStatus.COMPLETED,
                Task.duration_ms.isnot(None),
            )
        )
        avg_execution_time = avg_time_result.scalar_one() or 0.0

        # Average steps per task
        avg_steps_result = await db.execute(
            select(func.avg(Task.steps_count)).filter(
                Task.user_id == user.id,
                Task.status == TaskStatus.COMPLETED,
            )
        )
        avg_steps = avg_steps_result.scalar_one() or 0.0

        return OverviewMetrics(
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            success_rate=round(success_rate, 2),
            avg_execution_time_ms=round(avg_execution_time, 2),
            avg_steps_per_task=round(avg_steps, 2),
        )

    @staticmethod
    async def get_tasks_timeline(
        db: AsyncSession, user: User, days: int = 30
    ) -> List[TasksPerDay]:
        """Get tasks per day for the last N days."""
        start_date = datetime.utcnow().date() - timedelta(days=days)

        result = await db.execute(
            select(
                func.date(Task.created_at).label("date"),
                func.count(Task.id).label("total"),
                func.sum(
                    case((Task.status == TaskStatus.COMPLETED, 1), else_=0)
                ).label("completed"),
                func.sum(
                    case((Task.status == TaskStatus.FAILED, 1), else_=0)
                ).label("failed"),
                func.sum(
                    case((Task.status == TaskStatus.STOPPED, 1), else_=0)
                ).label("stopped"),
            )
            .filter(
                Task.user_id == user.id,
                func.date(Task.created_at) >= start_date,
            )
            .group_by(func.date(Task.created_at))
            .order_by(func.date(Task.created_at))
        )

        timeline = []
        for row in result:
            timeline.append(
                TasksPerDay(
                    date=row.date,
                    total=row.total or 0,
                    completed=row.completed or 0,
                    failed=row.failed or 0,
                    stopped=row.stopped or 0,
                )
            )

        return timeline

    @staticmethod
    async def get_perception_distribution(
        db: AsyncSession, user: User
    ) -> PerceptionDistribution:
        """Get distribution of perception sources used."""
        result = await db.execute(
            select(
                func.sum(
                    case((Action.perception_source == PerceptionSource.VISION, 1), else_=0)
                ).label("vision_count"),
                func.sum(
                    case((Action.perception_source == PerceptionSource.DOM, 1), else_=0)
                ).label("dom_count"),
                func.sum(
                    case((Action.perception_source == PerceptionSource.HYBRID, 1), else_=0)
                ).label("hybrid_count"),
            )
            .select_from(Action)
            .join(Execution)
            .join(Task)
            .filter(Task.user_id == user.id)
        )

        row = result.one()

        return PerceptionDistribution(
            vision_count=row.vision_count or 0,
            dom_count=row.dom_count or 0,
            hybrid_count=row.hybrid_count or 0,
        )

    @staticmethod
    async def get_action_distribution(
        db: AsyncSession, user: User
    ) -> List[ActionDistribution]:
        """Get distribution of action types with success/fail counts."""
        result = await db.execute(
            select(
                Action.action_type,
                func.count(Action.id).label("count"),
                func.sum(
                    case((Action.status == ActionStatus.SUCCESS, 1), else_=0)
                ).label("success_count"),
                func.sum(
                    case((Action.status == ActionStatus.FAILED, 1), else_=0)
                ).label("fail_count"),
            )
            .select_from(Action)
            .join(Execution)
            .join(Task)
            .filter(Task.user_id == user.id)
            .group_by(Action.action_type)
            .order_by(func.count(Action.id).desc())
        )

        distribution = []
        for row in result:
            distribution.append(
                ActionDistribution(
                    action_type=row.action_type.value,
                    count=row.count or 0,
                    success_count=row.success_count or 0,
                    fail_count=row.fail_count or 0,
                )
            )

        return distribution
