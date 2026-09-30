async def test_liveness_and_readiness(client):
    assert (await client.get("/api/health")).json()["status"] == "ok"
    assert (await client.get("/api/health/ready")).json()["status"] == "ready"


async def test_security_headers_and_request_id(client):
    r = await client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-request-id"]


async def test_cors_allows_only_configured_origins(client):
    ok = await client.options("/api/tasks", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    bad = await client.options("/api/tasks", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers
    assert "access-control-allow-credentials" not in ok.headers


async def test_database_health_shape_used_by_dashboard(client):
    body = (await client.get("/api/health/database")).json()
    assert body == {"status": "healthy", "connected": True, "message": "Database connection is healthy"}
