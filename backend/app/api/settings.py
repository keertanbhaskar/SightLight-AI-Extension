from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.user import UserSettingsResponse, UserSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=UserSettingsResponse)
async def get_settings(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user settings."""
    result = await db.execute(
        select(UserSettings).filter(UserSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        # Create default settings if they don't exist
        settings = UserSettings(user_id=current_user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return settings


@router.put("", response_model=UserSettingsResponse)
async def update_settings(
    settings_update: UserSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user settings."""
    result = await db.execute(
        select(UserSettings).filter(UserSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Settings not found",
        )

    # Update fields
    if settings_update.perception_mode is not None:
        settings.perception_mode = settings_update.perception_mode
    if settings_update.confidence_threshold is not None:
        settings.confidence_threshold = settings_update.confidence_threshold
    if settings_update.max_steps is not None:
        settings.max_steps = settings_update.max_steps
    if settings_update.max_runtime is not None:
        settings.max_runtime = settings_update.max_runtime
    if settings_update.require_confirmation is not None:
        settings.require_confirmation = settings_update.require_confirmation
    if settings_update.theme is not None:
        settings.theme = settings_update.theme

    await db.commit()
    await db.refresh(settings)

    return settings
