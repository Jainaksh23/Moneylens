import pytest
from httpx import AsyncClient

from app.config import settings


@pytest.mark.asyncio
async def test_protected_route_missing_key(async_client: AsyncClient):
    response = await async_client.get("/api/v1/internal/ping")
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "UNAUTHORIZED"
    assert "requestId" in data


@pytest.mark.asyncio
async def test_protected_route_invalid_key(async_client: AsyncClient):
    response = await async_client.get(
        "/api/v1/internal/ping",
        headers={"X-Internal-Key": "wrong-internal-key-sample"},
    )
    assert response.status_code == 403
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "FORBIDDEN"
    assert "requestId" in data


@pytest.mark.asyncio
async def test_protected_route_valid_key(async_client: AsyncClient):
    response = await async_client.get(
        "/api/v1/internal/ping",
        headers={"X-Internal-Key": settings.internal_api_key},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["authorized"] is True
    assert "message" in data
