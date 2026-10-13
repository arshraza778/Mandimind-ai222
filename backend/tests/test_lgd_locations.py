"""
Automated Tests for the Chhattisgarh LGD Location Dataset Integration:
1. Verifies dataset loading from docs/chhattisgarh_lgd_blocks_dataset/ (33 districts, 146 blocks, 179 total records).
2. Verifies consistency of official LGD codes (state 22, district codes, block codes).
3. Verifies district-to-block hierarchy and handling of duplicate block names in same district (Nawagarh).
4. Verifies idempotency of repeated database imports (no duplicate rows created).
5. Verifies GET /locations/hierarchy returns actual LGD locations by default without demo records.
6. Verifies filtering by district_id (both LGD_DIST_374 and 374) and block_id (LGD_BLK_3595 and 3595).
7. Verifies invalid location identifiers return 404 Not Found (no silent fallback).
8. Verifies POST /locations/confirm validates district-to-block relationships (400 on mismatch).
9. Verifies GET /locations/geojson returns points and polygon GIS features.
10. Verifies simulated weather and malaria telemetry records remain clearly labelled as DEMO DATA.
11. Verifies backward compatibility for legacy demo queries (DIST_SAMPLE, BLK_A..BLK_F).
"""

from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app
from app.db.session import init_db, SessionLocal
from app.db.models import LocationUnit
from app.lgd_locations import (
    load_lgd_dataset_records,
    import_lgd_locations_to_db,
    resolve_location_unit,
    load_lgd_geojson,
    DEFAULT_LGD_DISTRICT_ID,
    DEFAULT_LGD_BLOCK_ID,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_db():
    init_db()
    db = SessionLocal()
    try:
        import_lgd_locations_to_db(db)
    finally:
        db.close()
    yield


def test_lgd_dataset_loader_counts_and_attributes():
    """Verify loading from docs/chhattisgarh_lgd_blocks_dataset/ yields exactly 33 districts and 146 blocks."""
    bundle = load_lgd_dataset_records()
    summary = bundle["summary"]

    assert summary["state_name"] == "Chhattisgarh"
    assert summary["state_lgd_code"] == 22
    assert summary["total_districts"] == 33
    assert summary["total_blocks"] == 146
    assert summary["total_records"] == 179

    # Verify districts have state_lgd_code=22 and no invented coordinates
    for d in bundle["districts"]:
        assert d["level"] == "district"
        assert d["state_lgd_code"] == 22
        assert d["district_lgd_code"] is not None
        assert d["latitude"] is None
        assert d["longitude"] is None
        assert d["unit_id"].startswith("LGD_DIST_")

    # Verify blocks have valid coordinates and boundary provenance
    for b in bundle["blocks"]:
        assert b["level"] == "block"
        assert b["state_lgd_code"] == 22
        assert b["district_lgd_code"] is not None
        assert b["block_lgd_code"] is not None
        assert isinstance(b["latitude"], float)
        assert isinstance(b["longitude"], float)
        assert b["coordinate_type"] is not None
        assert b["unit_id"].startswith("LGD_BLK_")
        assert b["parent_id"].startswith("LGD_DIST_")

    # Verify duplicate block name in Janjgir-Champa (Nawagarh LGD 3638 vs 3647) is documented
    dups = summary["duplicate_block_names_in_same_district"]
    assert len(dups) >= 2
    assert all(d["block_name"] == "Nawagarh" for d in dups)


def test_repeated_import_idempotency():
    """Verify repeated calls to import_lgd_locations_to_db do not create duplicate rows."""
    db = SessionLocal()
    try:
        # First check baseline counts
        dist_count_before = db.query(LocationUnit).filter(LocationUnit.level == "district", LocationUnit.is_demo == False).count()
        blk_count_before = db.query(LocationUnit).filter(LocationUnit.level == "block", LocationUnit.is_demo == False).count()
        assert dist_count_before == 33
        assert blk_count_before == 146

        # Run import again
        res = import_lgd_locations_to_db(db)
        assert res["inserted"] == 0, f"Expected 0 new inserts on repeat, got {res['inserted']}"

        dist_count_after = db.query(LocationUnit).filter(LocationUnit.level == "district", LocationUnit.is_demo == False).count()
        blk_count_after = db.query(LocationUnit).filter(LocationUnit.level == "block", LocationUnit.is_demo == False).count()
        assert dist_count_after == 33
        assert blk_count_after == 146
    finally:
        db.close()


def test_api_locations_hierarchy_default_and_filters():
    """Verify GET /locations/hierarchy returns 33 districts and 146 blocks by default and filters accurately."""
    resp = client.get("/locations/hierarchy")
    assert resp.status_code == 200
    data = resp.json()

    assert len(data["districts"]) == 33
    assert len(data["blocks"]) == 146
    assert len(data["villages"]) == 0
    assert data["summary"]["total_districts"] == 33
    assert data["summary"]["total_blocks"] == 146
    assert data["summary"]["total_records"] == 179

    # Filter by Bastar (using stable unit_id LGD_DIST_374)
    resp_bastar1 = client.get("/locations/hierarchy?district_id=LGD_DIST_374")
    assert resp_bastar1.status_code == 200
    bastar1_blks = resp_bastar1.json()["blocks"]
    assert len(bastar1_blks) == 7

    # Filter by Bastar (using numeric LGD code 374)
    resp_bastar2 = client.get("/locations/hierarchy?district_id=374")
    assert resp_bastar2.status_code == 200
    bastar2_blks = resp_bastar2.json()["blocks"]
    assert len(bastar2_blks) == 7

    bastar_names = {b["unit_name"] for b in bastar2_blks}
    assert "Jagdalpur" in bastar_names
    assert "Bastar" in bastar_names
    assert "Tokapal" in bastar_names
    assert "Darbha" in bastar_names
    assert "Bakawand" in bastar_names
    assert "Bastanar" in bastar_names
    assert "Lohandiguda" in bastar_names


def test_api_locations_hierarchy_invalid_identifiers():
    """Verify invalid district and block identifiers return 404 rather than silently falling back."""
    resp_bad_dist = client.get("/locations/hierarchy?district_id=NON_EXISTENT_DISTRICT_999")
    assert resp_bad_dist.status_code == 404
    assert "not found" in resp_bad_dist.json()["detail"].lower()

    resp_bad_blk = client.get("/locations/hierarchy?block_id=NON_EXISTENT_BLOCK_999")
    assert resp_bad_blk.status_code == 404
    assert "not found" in resp_bad_blk.json()["detail"].lower()


def test_api_locations_confirm_and_parent_child_validation():
    """Verify POST /locations/confirm validates district-to-block hierarchy."""
    # Valid selection: Bastar (LGD_DIST_374) -> Jagdalpur (LGD_BLK_3595)
    resp_ok = client.post("/locations/confirm?district_id=LGD_DIST_374&block_id=LGD_BLK_3595")
    assert resp_ok.status_code == 200
    loc = resp_ok.json()["location"]
    assert loc["district"]["unit_name"] == "Bastar"
    assert loc["district"]["district_lgd_code"] == 374
    assert loc["block"]["unit_name"] == "Jagdalpur"
    assert loc["block"]["block_lgd_code"] == 3595
    assert loc["block"]["latitude"] == pytest.approx(18.961882, abs=1e-4)
    assert loc["block"]["longitude"] == pytest.approx(82.097728, abs=1e-4)

    # Valid selection using numeric LGD codes: 374 -> 3595
    resp_ok_num = client.post("/locations/confirm?district_id=374&block_id=3595")
    assert resp_ok_num.status_code == 200

    # Invalid cross-district mismatch: Bastar (374) with Balod block (3629) -> 400 Bad Request
    resp_mismatch = client.post("/locations/confirm?district_id=LGD_DIST_374&block_id=LGD_BLK_3629")
    assert resp_mismatch.status_code == 400
    assert "does not belong to district" in resp_mismatch.json()["detail"]


def test_api_locations_geojson_points_and_polygons():
    """Verify GET /locations/geojson serves GeoJSON features with coordinates."""
    # All points
    resp_pts = client.get("/locations/geojson?layer=points")
    assert resp_pts.status_code == 200
    pts_data = resp_pts.json()
    assert pts_data["type"] == "FeatureCollection"
    assert pts_data["feature_count"] == 146

    # Bastar points (district_lgd_code=374)
    resp_bastar_pts = client.get("/locations/geojson?layer=points&district_id=374")
    assert resp_bastar_pts.status_code == 200
    assert resp_bastar_pts.json()["feature_count"] == 7

    # Polygon layer
    resp_poly = client.get("/locations/geojson?layer=polygons&district_id=374")
    assert resp_poly.status_code == 200
    assert resp_poly.json()["feature_count"] == 7


def test_simulated_telemetry_honesty_labels_on_lgd_locations():
    """Verify viewing a real LGD location clearly labels surveillance and weather telemetry as DEMO DATA."""
    resp = client.get("/public/risk-dashboard?district_id=LGD_DIST_374&block_id=LGD_BLK_3595")
    assert resp.status_code == 200
    data = resp.json()

    # Location context uses real LGD metadata
    assert data["location"]["district"]["unit_name"] == "Bastar"
    assert data["location"]["district"]["district_lgd_code"] == 374
    assert data["location"]["block"]["unit_name"] == "Jagdalpur"
    assert data["location"]["block"]["block_lgd_code"] == 3595
    assert data["location"]["block"]["latitude"] is not None

    # Telemetry and risk remain explicitly labeled as DEMO DATA
    assert data["data_status"]["is_simulated"] is True
    assert "DEMO DATA" in data["data_status"]["status_badge"]
    assert "DEMO DATA" in data["data_status"]["honesty_disclosure"]
    assert data["risk"]["is_demo_telemetry"] is True

    # District block comparison displays actual Bastar blocks
    comp = data["multi_disease"]["location_comparison"]
    comp_names = {c["unit_name"] for c in comp}
    assert "Jagdalpur" in comp_names
    assert "Bastar" in comp_names
    assert all(c["is_demo_telemetry"] is True for c in comp)


def test_legacy_demo_queries_backward_compatibility():
    """Verify legacy queries for DIST_SAMPLE / BLK_A continue to work for existing test suites."""
    resp = client.get("/locations/hierarchy?district_id=DIST_SAMPLE")
    assert resp.status_code == 200
    demo_blks = resp.json()["blocks"]
    blk_ids = {b["unit_id"] for b in demo_blks}
    assert "BLK_A" in blk_ids
    assert "BLK_B" in blk_ids

    resp_risk = client.get("/public/risk-dashboard?district_id=DIST_SAMPLE&block_id=BLK_A&village_id=VIL_A1")
    assert resp_risk.status_code == 200
    assert resp_risk.json()["risk"]["category"] in ("High", "Very High")
