import jwt

from app.core.config import settings
from app.core import rate_limit
from tests.conftest import auth, register


async def test_register_login_me(client):
    await register(client)
    r = await client.post("/api/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert r.status_code == 200
    me = await client.get("/api/auth/me", headers=auth(r.json()))
    assert me.status_code == 200 and me.json()["email"] == "a@example.com"
    assert "password" not in me.text


async def test_email_is_case_insensitive_and_unique(client):
    await register(client, email="Bob@Example.com")
    r = await client.post("/api/auth/register", json={"name": "B", "email": "bob@example.COM", "password": "another-pass-1"})
    assert r.status_code == 409
    ok = await client.post("/api/auth/login", json={"email": "BOB@example.com", "password": "correct-horse-1"})
    assert ok.status_code == 200


async def test_bad_credentials_are_indistinguishable(client):
    await register(client)
    wrong_pw = await client.post("/api/auth/login", json={"email": "a@example.com", "password": "nope-nope-nope"})
    no_user = await client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()


async def test_unauthenticated_is_401_not_403(client):
    assert (await client.get("/api/tasks")).status_code == 401


async def test_password_rules(client):
    r = await client.post("/api/auth/register", json={"name": "A", "email": "a@example.com", "password": "short"})
    assert r.status_code == 422
    r = await client.post("/api/auth/register", json={"name": "A", "email": "a@example.com", "password": "x" * 5000})
    assert r.status_code == 422  # unbounded length would be an argon2 CPU DoS


async def test_refresh_flow_and_token_type_separation(client):
    t = await register(client)
    r = await client.post("/api/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 200
    new_access = r.json()["access_token"]
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})).status_code == 200
    # refresh token must not work as an access token, and vice versa
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {t['refresh_token']}"})).status_code == 401
    assert (await client.post("/api/auth/refresh", json={"refresh_token": t["access_token"]})).status_code == 401


async def test_tampered_and_alg_none_tokens_rejected(client):
    t = await register(client)
    forged = jwt.encode({"sub": jwt.decode(t["access_token"], options={"verify_signature": False})["sub"],
                         "type": "access", "exp": 9999999999}, "wrong-secret", algorithm="HS256")
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})).status_code == 401
    none_tok = jwt.encode({"sub": "x", "type": "access", "exp": 9999999999}, None, algorithm="none")
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {none_tok}"})).status_code == 401


async def test_expired_token_rejected(client):
    t = await register(client)
    sub = jwt.decode(t["access_token"], options={"verify_signature": False})["sub"]
    expired = jwt.encode({"sub": sub, "type": "access", "exp": 1}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})).status_code == 401


async def test_login_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_PER_MINUTE", 3)
    rate_limit.reset()
    codes = [(await client.post("/api/auth/login", json={"email": "x@example.com", "password": "whatever-1"})).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]
