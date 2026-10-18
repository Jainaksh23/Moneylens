import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint_reports_categorizer_version(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "modelVersions" in data
    assert "categorizer" in data["modelVersions"]
    assert data["modelVersions"]["categorizer"].startswith("v1.")


def test_predict_category_unauthorized_without_key(client):
    payload = {
        "items": [
            {"id": "1", "description": "Swiggy food order", "merchant": "Swiggy"}
        ]
    }
    response = client.post("/predict/category", json=payload)
    assert response.status_code in (401, 403)


def test_predict_category_success_with_internal_key(client):
    payload = {
        "items": [
            {"id": "1", "description": "Swiggy dinner order biryani", "merchant": "Swiggy"},
            {"id": "2", "description": "Zepto 10 min grocery vegetables milk", "merchant": "Zepto"},
            {"id": "3", "description": "Uber Premier trip to airport", "merchant": "Uber"},
        ]
    }
    headers = {"X-Internal-Key": settings.internal_api_key}
    response = client.post("/predict/category", json=payload, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert "predictions" in data
    assert len(data["predictions"]) == 3
    assert data["predictions"][0]["category"] == "Food"
    assert data["predictions"][1]["category"] == "Groceries"
    assert data["predictions"][2]["category"] == "Transport"
    assert "modelVersion" in data


def test_predict_category_accepts_raw_list(client):
    payload = [
        {"id": "10", "description": "Tata Power electricity bill", "merchant": "Tata Power"}
    ]
    headers = {"X-Internal-Key": settings.internal_api_key}
    response = client.post("/predict/category", json=payload, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data["predictions"]) == 1
    assert data["predictions"][0]["category"] == "Bills & Utilities"
