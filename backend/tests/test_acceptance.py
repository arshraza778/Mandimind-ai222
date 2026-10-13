from fastapi.testclient import TestClient
from pathlib import Path
from app.main import app
import yaml

client = TestClient(app)


def test_acceptance_changing_config_changes_meta_and_banner_without_code_changes():
    config_file = Path("backend/config.yaml")
    if not config_file.exists():
        config_file = Path("config.yaml")

    original_text = config_file.read_text(encoding="utf-8")

    try:
        # 1. Verify initial state from default config.yaml
        resp1 = client.get("/meta")
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["data_source"] == "simulated"
        assert data1["granularity"] == "weekly"
        assert data1["unit_label"] == "weeks"
        assert data1["banner_text"] == "PROTOTYPE - SIMULATED DATA - sample names only"

        # 2. Modify config.yaml directly to simulate changing config
        config_data = yaml.safe_load(original_text)
        config_data["data_source"] = "real"
        config_data["granularity"] = "monthly"
        config_data["geography_level"] = "district"

        config_file.write_text(yaml.dump(config_data), encoding="utf-8")

        # 3. Hit /meta again without touching any code
        resp2 = client.get("/meta")
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["data_source"] == "real"
        assert data2["granularity"] == "monthly"
        assert data2["unit_label"] == "months"
        assert data2["geography_label"] == "district"
        assert data2["banner_text"] == "PROTOTYPE - REAL DATA"

    finally:
        # Restore original config.yaml
        config_file.write_text(original_text, encoding="utf-8")

    # 4. Confirm restoration
    resp3 = client.get("/meta")
    assert resp3.status_code == 200
    data3 = resp3.json()
    assert data3["data_source"] == "simulated"
    assert data3["granularity"] == "weekly"
    assert data3["unit_label"] == "weeks"
    assert data3["banner_text"] == "PROTOTYPE - SIMULATED DATA - sample names only"
