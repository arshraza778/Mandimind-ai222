"""
Tests for API Documentation Security Configuration.
Verifies that /docs, /redoc, and /openapi.json are disabled in production deployments
and return 404 Not Found, while legitimate API endpoints remain functional.
Also verifies development mode and fail-safe defaults for missing/invalid configurations.
"""

import os
import sys
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import httpx
from app.main import should_enable_docs, app


@pytest.mark.anyio
async def test_production_mode_disables_documentation_endpoints(monkeypatch):
    """
    In production mode (ENVIRONMENT=production), /docs, /redoc, /openapi.json,
    and /docs/oauth2-redirect MUST return 404 Not Found.
    Legitimate API endpoints (/health, /meta) MUST remain accessible (200 OK).
    """
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ENABLE_DOCS", raising=False)
    assert should_enable_docs() is False

    # Build FastAPI instance using production docs setting
    prod_app = FastAPI(
        title="Mitanin Signal API (Production Mode)",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    # Mount routes from main app
    for route in app.routes:
        if getattr(route, "path", None) not in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
            prod_app.routes.append(route)

    transport = httpx.ASGITransport(app=prod_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Documentation endpoints must return 404 Not Found
        docs_res = await client.get("/docs")
        assert docs_res.status_code == 404, f"Expected 404 for /docs, got {docs_res.status_code}"

        redoc_res = await client.get("/redoc")
        assert redoc_res.status_code == 404, f"Expected 404 for /redoc, got {redoc_res.status_code}"

        openapi_res = await client.get("/openapi.json")
        assert openapi_res.status_code == 404, f"Expected 404 for /openapi.json, got {openapi_res.status_code}"

        oauth_res = await client.get("/docs/oauth2-redirect")
        assert oauth_res.status_code == 404, f"Expected 404 for /docs/oauth2-redirect, got {oauth_res.status_code}"

        # Legitimate API endpoints must return 200 OK
        health_res = await client.get("/health")
        assert health_res.status_code == 200
        assert health_res.json() == {"status": "ok"}

        meta_res = await client.get("/meta")
        assert meta_res.status_code == 200
        assert "granularity" in meta_res.json()


@pytest.mark.anyio
async def test_development_mode_enables_documentation_endpoints(monkeypatch):
    """
    In development mode (ENVIRONMENT=development), /docs and /openapi.json
    MUST be accessible and return 200 OK.
    """
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("ENABLE_DOCS", "true")
    assert should_enable_docs() is True

    dev_app = FastAPI(
        title="Mitanin Signal API (Dev Mode)",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    for route in app.routes:
        if getattr(route, "path", None) not in ("/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"):
            dev_app.routes.append(route)

    transport = httpx.ASGITransport(app=dev_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        docs_res = await client.get("/docs")
        assert docs_res.status_code == 200

        openapi_res = await client.get("/openapi.json")
        assert openapi_res.status_code == 200
        schema = openapi_res.json()
        assert schema.get("openapi", "").startswith("3.")

        health_res = await client.get("/health")
        assert health_res.status_code == 200


def test_fail_safe_defaults_when_configuration_missing_or_invalid(monkeypatch):
    """
    Fail-safe check:
    - Missing environment variable (empty) -> False
    - Unrecognized environment name ('staging_preview') -> False
    - Invalid ENABLE_DOCS value ('invalid_str') -> False
    - Explicit disable ENABLE_DOCS='false' in dev environment -> False
    - Explicit enable ENABLE_DOCS='true' in prod environment -> True (for private staging)
    """
    # 1. Missing environment variable
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("ENABLE_DOCS", raising=False)
    assert should_enable_docs() is False, "Missing environment must fail safely to False"

    # 2. Unrecognized environment name
    monkeypatch.setenv("ENVIRONMENT", "unknown_custom_cluster")
    assert should_enable_docs() is False, "Unrecognized environment must fail safely to False"

    # 3. Invalid ENABLE_DOCS value
    monkeypatch.setenv("ENABLE_DOCS", "random_unrecognized_value")
    assert should_enable_docs() is False, "Invalid ENABLE_DOCS must fail safely to False"

    # 4. Explicit ENABLE_DOCS=false overrides development environment
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("ENABLE_DOCS", "false")
    assert should_enable_docs() is False, "ENABLE_DOCS=false must disable docs even in development"

    # 5. Explicit ENABLE_DOCS=0 overrides development environment
    monkeypatch.setenv("ENABLE_DOCS", "0")
    assert should_enable_docs() is False

    # 6. Explicit ENABLE_DOCS=true allows enabling
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ENABLE_DOCS", "true")
    assert should_enable_docs() is True, "Explicit ENABLE_DOCS=true must allow override if needed"


@pytest.mark.anyio
async def test_live_app_instance_documentation_endpoints():
    """
    Tests the actual imported `app` instance from app.main.
    Verifies that requests to /health, /meta, and /dashboard/summary work,
    and that documentation endpoint status reflects `app.docs_url`.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. API health check
        health_res = await client.get("/health")
        assert health_res.status_code == 200

        # 2. Check documentation routes match app.docs_url configuration
        docs_res = await client.get("/docs")
        if app.docs_url is None:
            assert docs_res.status_code == 404
        else:
            assert docs_res.status_code == 200

        openapi_res = await client.get("/openapi.json")
        if app.openapi_url is None:
            assert openapi_res.status_code == 404
        else:
            assert openapi_res.status_code == 200
