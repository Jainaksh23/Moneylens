import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "modelVersions" in data
    assert isinstance(data["modelVersions"], dict)
    assert "X-Request-Id" in response.headers


@pytest.mark.asyncio
async def test_request_id_propagation(async_client: AsyncClient):
    custom_trace_id = "trace-custom-998877"
    response = await async_client.get("/health", headers={"X-Request-Id": custom_trace_id})
    assert response.status_code == 200
    assert response.headers["X-Request-Id"] == custom_trace_id
