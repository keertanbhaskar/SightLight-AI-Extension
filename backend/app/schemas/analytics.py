from pydantic import BaseModel
from typing import List
from datetime import date


class OverviewMetrics(BaseModel):
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    success_rate: float
    avg_execution_time_ms: float
    avg_steps_per_task: float


class TasksPerDay(BaseModel):
    date: date
    total: int
    completed: int
    failed: int
    stopped: int


class TasksTimelineResponse(BaseModel):
    timeline: List[TasksPerDay]


class PerceptionDistribution(BaseModel):
    vision_count: int
    dom_count: int
    hybrid_count: int


class ActionDistribution(BaseModel):
    action_type: str
    count: int
    success_count: int
    fail_count: int


class ActionDistributionResponse(BaseModel):
    distribution: List[ActionDistribution]


class AnalyticsResponse(BaseModel):
    overview: OverviewMetrics
    tasks_timeline: List[TasksPerDay]
    perception_distribution: PerceptionDistribution
    action_distribution: List[ActionDistribution]
