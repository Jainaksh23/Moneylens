import pytest
from httpx import AsyncClient

from app.services.categorizer import CategorizerService


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
async def test_readiness_endpoint_loaded(async_client: AsyncClient):
    response = await async_client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["checks"]["model"] == "loaded"


@pytest.mark.asyncio
async def test_readiness_endpoint_unloaded(async_client: AsyncClient):
    cat_service = CategorizerService.get_instance()
    original_model = cat_service.model
    try:
        cat_service.model = None
        response = await async_client.get("/health/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unavailable"
        assert data["checks"]["model"] == "not_loaded"
    finally:
        cat_service.model = original_model


@pytest.mark.asyncio
async def test_request_id_propagation(async_client: AsyncClient):
    custom_trace_id = "trace-custom-998877"
    response = await async_client.get("/health", headers={"X-Request-Id": custom_trace_id})
    assert response.status_code == 200
    assert response.headers["X-Request-Id"] == custom_trace_id
