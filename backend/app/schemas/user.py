from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from uuid import UUID
from typing import Optional

from app.models.user_settings import PerceptionMode, Theme


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserResponse(UserBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserSettingsBase(BaseModel):
    perception_mode: PerceptionMode = PerceptionMode.AUTO
    confidence_threshold: float = Field(0.75, ge=0.5, le=0.95)
    max_steps: int = Field(20, ge=1, le=100)
    max_runtime: int = Field(120, ge=5, le=600)
    require_confirmation: bool = True
    theme: Theme = Theme.LIGHT


class UserSettingsUpdate(BaseModel):
    perception_mode: Optional[PerceptionMode] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.5, le=0.95)
    max_steps: Optional[int] = Field(None, ge=1, le=100)
    max_runtime: Optional[int] = Field(None, ge=5, le=600)
    require_confirmation: Optional[bool] = None
    theme: Optional[Theme] = None


class UserSettingsResponse(UserSettingsBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
