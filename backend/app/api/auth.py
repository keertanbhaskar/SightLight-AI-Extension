from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limit_auth
from app.core.security import get_current_user
from app.schemas.auth import UserRegister, UserLogin, Token, TokenRefresh, AccessToken
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED, dependencies=[Depends(limit_auth)])
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    user = await AuthService.register_user(db, user_data)
    tokens = AuthService.create_tokens(user)
    return tokens


@router.post("/login", response_model=Token, dependencies=[Depends(limit_auth)])
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return access tokens."""
    user = await AuthService.authenticate_user(db, login_data)
    tokens = AuthService.create_tokens(user)
    return tokens


@router.post("/refresh", response_model=AccessToken, dependencies=[Depends(limit_auth)])
async def refresh_token(token_data: TokenRefresh):
    """Refresh access token using refresh token."""
    access_token = AuthService.refresh_access_token(token_data.refresh_token)
    return AccessToken(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information."""
    return current_user
