import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

_hasher = PasswordHasher()
# Verified against when the account doesn't exist so response time doesn't reveal which emails are registered.
_DUMMY_HASH = _hasher.hash("timing-attack-equaliser")

bearer = HTTPBearer(auto_error=False)


def get_password_hash(password: str) -> str:
    return _hasher.hash(password)


def verify_password(plain: str, hashed: str | None) -> bool:
    try:
        return _hasher.verify(hashed or _DUMMY_HASH, plain) and hashed is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def _encode(data: dict[str, Any], token_type: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {**data, "type": token_type, "iat": now, "exp": now + ttl, "jti": uuid.uuid4().hex}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(data: dict[str, Any]) -> str:
    return _encode(data, "access", timedelta(minutes=settings.JWT_EXPIRE_MINUTES))


def create_refresh_token(data: dict[str, Any]) -> str:
    return _encode(data, "refresh", timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS))


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError:
        raise unauthorized from None
    if payload.get("type") != expected_type:
        raise unauthorized
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:  # HTTPBearer's own error is 403; 401 is the correct status
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials, "access")
    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials") from None
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user
