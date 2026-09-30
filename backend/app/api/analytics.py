from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.schemas.analytics import (
    OverviewMetrics,
    TasksTimelineResponse,
    PerceptionDistribution,
    ActionDistributionResponse,
    AnalyticsResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview", response_model=OverviewMetrics)
async def get_overview(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get overview metrics for the current user."""
    metrics = await AnalyticsService.get_overview_metrics(db, current_user)
    return metrics


@router.get("/tasks", response_model=TasksTimelineResponse)
async def get_tasks_timeline(
    days: int = Query(30, ge=1, le=365, description="Number of days to include"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get tasks timeline for the last N days."""
    timeline = await AnalyticsService.get_tasks_timeline(db, current_user, days)
    return TasksTimelineResponse(timeline=timeline)


@router.get("/perception", response_model=PerceptionDistribution)
async def get_perception_distribution(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get distribution of perception sources."""
    distribution = await AnalyticsService.get_perception_distribution(db, current_user)
    return distribution


@router.get("/actions", response_model=ActionDistributionResponse)
async def get_action_distribution(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get distribution of action types."""
    distribution = await AnalyticsService.get_action_distribution(db, current_user)
    return ActionDistributionResponse(distribution=distribution)


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get complete analytics data."""
    overview = await AnalyticsService.get_overview_metrics(db, current_user)
    timeline = await AnalyticsService.get_tasks_timeline(db, current_user, days)
    perception = await AnalyticsService.get_perception_distribution(db, current_user)
    actions = await AnalyticsService.get_action_distribution(db, current_user)

    return AnalyticsResponse(
        overview=overview,
        tasks_timeline=timeline,
        perception_distribution=perception,
        action_distribution=actions,
    )
