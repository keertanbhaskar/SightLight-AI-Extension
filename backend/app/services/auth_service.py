import logging

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.auth import UserRegister, UserLogin, Token
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)


class AuthService:
    """Service for authentication operations."""

    @staticmethod
    async def register_user(db: AsyncSession, user_data: UserRegister) -> User:
        """Register a new user."""
        # Check if email already exists
        result = await db.execute(select(User).filter(User.email == user_data.email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        # Create new user
        hashed_password = get_password_hash(user_data.password)
        new_user = User(
            name=user_data.name,
            email=user_data.email,
            password_hash=hashed_password,
        )

        db.add(new_user)
        try:
            await db.flush()  # Flush to get the user ID
            db.add(UserSettings(user_id=new_user.id))
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            ) from None
        except Exception:
            logger.exception("Registration database error")
            await db.rollback()
            raise
        await db.refresh(new_user)

        return new_user

    @staticmethod
    async def authenticate_user(db: AsyncSession, login_data: UserLogin) -> User:
        """Authenticate a user and return user object if valid."""
        # Find user by email
        result = await db.execute(select(User).filter(User.email == login_data.email))
        user = result.scalar_one_or_none()

        # verify_password() hashes against a dummy when user is None, so timing does not reveal registered emails.
        if not verify_password(login_data.password, user.password_hash if user else None) or user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

        return user

    @staticmethod
    def create_tokens(user: User) -> Token:
        """Create access and refresh tokens for a user."""
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )

    @staticmethod
    def refresh_access_token(refresh_token: str) -> str:
        """Create a new access token from a refresh token."""
        payload = decode_token(refresh_token, "refresh")
        return create_access_token(data={"sub": payload["sub"]})
