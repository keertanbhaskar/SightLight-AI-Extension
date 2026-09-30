from tests.conftest import auth, register


async def _task(client, tok, text="click login"):
    r = await client.post("/api/tasks", json={"instruction": text}, headers=auth(tok))
    assert r.status_code == 201, r.text
    return r.json()


async def test_task_crud_and_pagination(client):
    tok = await register(client)
    for i in range(5):
        await _task(client, tok, f"task {i}")
    page = (await client.get("/api/tasks?page=1&page_size=2", headers=auth(tok))).json()
    assert page["total"] == 5 and len(page["tasks"]) == 2
    tid = page["tasks"][0]["id"]
    r = await client.patch(f"/api/tasks/{tid}", json={"status": "completed", "steps_count": 3}, headers=auth(tok))
    assert r.json()["status"] == "completed"
    assert (await client.delete(f"/api/tasks/{tid}", headers=auth(tok))).status_code == 204
    assert (await client.get(f"/api/tasks/{tid}", headers=auth(tok))).status_code == 404


async def test_users_cannot_see_or_modify_each_others_data(client):
    a = await register(client, "a@example.com")
    b = await register(client, "b@example.com")
    t = await _task(client, a)
    assert (await client.get(f"/api/tasks/{t['id']}", headers=auth(b))).status_code == 404
    assert (await client.patch(f"/api/tasks/{t['id']}", json={"status": "failed"}, headers=auth(b))).status_code == 404
    assert (await client.delete(f"/api/tasks/{t['id']}", headers=auth(b))).status_code == 404
    assert (await client.post(f"/api/executions/tasks/{t['id']}/executions", json={}, headers=auth(b))).status_code == 404
    assert (await client.get("/api/tasks", headers=auth(b))).json()["total"] == 0


async def test_search_treats_wildcards_literally(client):
    tok = await register(client)
    await _task(client, tok, "100% done")
    await _task(client, tok, "something else")
    r = (await client.get("/api/tasks", params={"search": "%"}, headers=auth(tok))).json()
    assert r["total"] == 1  # "%" must not match everything


async def test_instruction_length_limit(client):
    tok = await register(client)
    r = await client.post("/api/tasks", json={"instruction": "x" * 1001}, headers=auth(tok))
    assert r.status_code == 422


async def test_extension_sync_flow_matches_what_the_extension_sends(client):
    """Mirrors apps/extension/src/background/sync.ts step by step."""
    tok = await register(client)
    h = auth(tok)
    task = (await client.post("/api/tasks", json={"instruction": "search for cats"}, headers=h)).json()
    r = await client.patch(f"/api/tasks/{task['id']}", headers=h, json={
        "status": "completed", "started_at": "2026-09-30T10:00:00.000Z", "completed_at": "2026-09-30T10:00:05.000Z",
        "duration_ms": 5000, "steps_count": 2})
    assert r.status_code == 200, r.text
    ex = (await client.post(f"/api/executions/tasks/{task['id']}/executions", json={"state": "idle"}, headers=h)).json()
    r = await client.patch(f"/api/executions/{ex['id']}", headers=h, json={
        "state": "completed", "completed_at": "2026-09-30T10:00:05.000Z", "duration_ms": 5000})
    assert r.status_code == 200, r.text
    for kind, ok in [("navigate", "success"), ("type", "success"), ("press", "failed")]:
        r = await client.post(f"/api/executions/{ex['id']}/actions", headers=h, json={
            "action_type": kind, "target_label": "Search", "perception_source": "dom", "status": ok,
            "metadata": {"detail": "typed", "at": 1}})
        assert r.status_code == 201, r.text
        assert r.json()["metadata"] == {"detail": "typed", "at": 1}  # public name preserved
    full = (await client.get(f"/api/executions/{ex['id']}", headers=h)).json()
    assert [a["action_type"] for a in full["actions"]] == ["navigate", "type", "press"]

    overview = (await client.get("/api/analytics/overview", headers=h)).json()
    assert overview["total_tasks"] == 1 and overview["completed_tasks"] == 1 and overview["success_rate"] == 100.0
    dist = {d["action_type"]: d for d in (await client.get("/api/analytics/actions", headers=h)).json()["distribution"]}
    assert dist["press"]["fail_count"] == 1 and dist["navigate"]["success_count"] == 1
