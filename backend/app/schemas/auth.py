from pydantic import BaseModel, EmailStr, Field, field_validator


def _norm_email(v: str) -> str:
    return v.strip().lower()


class UserRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    _email = field_validator("email", mode="after")(_norm_email)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

    _email = field_validator("email", mode="after")(_norm_email)


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=2048)


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
