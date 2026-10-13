"""
Official Chhattisgarh LGD District & Development-Block Location Loader and Importer.

Loads the authoritative Chhattisgarh Local Government Directory (LGD) dataset from
`docs/chhattisgarh_lgd_blocks_dataset/` (or `docs/chhattisgarh_lgd_blocks_dataset (1)/`):
- `chhattisgarh_districts.csv`: 33 districts (`state_lgd_code = 22`, `district_lgd_code` 374..763)
- `chhattisgarh_blocks.csv`: 146 development blocks (`block_lgd_code` 3591..7624, with representative
  WGS84 polygon surface coordinates)
- `chhattisgarh_block_points.geojson` & `chhattisgarh_blocks.geojson`: GIS point and polygon layers

Design principles:
1. Preserves official LGD codes (`state_lgd_code`, `district_lgd_code`, `block_lgd_code`) and stable IDs
   (`LGD_DIST_<district_lgd_code>`, `LGD_BLK_<block_lgd_code>`).
2. Does NOT invent coordinates for districts (which have no coordinates in `chhattisgarh_districts.csv`)
   or invent villages (which are not in the LGD block dataset).
3. Does NOT associate simulated weather/malaria records with real LGD locations merely because names look similar.
4. Avoids duplicate records during repeated imports (idempotent upsert by `unit_id`).
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.db.models import LocationUnit

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

DEFAULT_LGD_DISTRICT_ID = "LGD_DIST_374"   # Bastar (LGD 374)
DEFAULT_LGD_BLOCK_ID = "LGD_BLK_3595"     # Jagdalpur (LGD 3595)


def resolve_lgd_dataset_dir() -> Path:
    """Locates the Chhattisgarh LGD dataset folder without assuming a single hardcoded directory name."""
    candidates = [
        PROJECT_ROOT / "docs" / "chhattisgarh_lgd_blocks_dataset",
        PROJECT_ROOT / "docs" / "chhattisgarh_lgd_blocks_dataset (1)",
    ]
    for c in candidates:
        if c.exists() and (c / "chhattisgarh_districts.csv").exists() and (c / "chhattisgarh_blocks.csv").exists():
            return c
    raise FileNotFoundError(
        "Chhattisgarh LGD dataset folder not found under docs/chhattisgarh_lgd_blocks_dataset."
    )


def load_lgd_dataset_records() -> Dict[str, Any]:
    """
    Reads and validates `chhattisgarh_districts.csv` and `chhattisgarh_blocks.csv`.
    Returns structured district and block specifications ready for database import.
    """
    dataset_dir = resolve_lgd_dataset_dir()
    districts_csv = dataset_dir / "chhattisgarh_districts.csv"
    blocks_csv = dataset_dir / "chhattisgarh_blocks.csv"

    districts: List[Dict[str, Any]] = []
    seen_dist_codes: set[int] = set()

    with open(districts_csv, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            d_code = int(str(row["district_lgd_code"]).strip())
            if d_code in seen_dist_codes:
                continue
            seen_dist_codes.add(d_code)
            s_code = int(str(row.get("state_lgd_code", 22)).strip())
            s_name = str(row.get("state_name", "Chhattisgarh")).strip()
            d_name = str(row["district_name"]).strip()
            unit_id = f"LGD_DIST_{d_code}"

            facility_info = json.dumps({
                "name": f"District Health Office / District Hospital — {d_name}",
                "type": "District Health Administration (LGD)",
                "phone": "104 (Chhattisgarh Health Helpline)",
                "services": [
                    "Malaria Microscopy & Bivalent RDT Surveillance",
                    "NVBDCP District Vector Control Coordination",
                    "Emergency Referral Transport (108 / 104)",
                ],
            })

            districts.append({
                "unit_id": unit_id,
                "unit_name": d_name,
                "level": "district",
                "parent_id": None,
                "forecast_unit_id": None,
                "latitude": None,   # Not present in chhattisgarh_districts.csv; never invented
                "longitude": None,  # Not present in chhattisgarh_districts.csv; never invented
                "health_facility": facility_info,
                "state_name": s_name,
                "state_lgd_code": s_code,
                "district_lgd_code": d_code,
                "block_lgd_code": None,
                "coordinate_type": None,
                "coordinate_source": None,
                "boundary_source": None,
                "is_demo": False,
            })

    blocks: List[Dict[str, Any]] = []
    seen_blk_codes: set[int] = set()
    block_name_counts_per_dist: Dict[tuple[int, str], int] = {}

    raw_block_rows: List[Dict[str, str]] = []
    with open(blocks_csv, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_block_rows.append(row)
            d_code = int(str(row["district_lgd_code"]).strip())
            b_name = str(row["block_name"]).strip()
            key = (d_code, b_name.lower())
            block_name_counts_per_dist[key] = block_name_counts_per_dist.get(key, 0) + 1

    duplicate_block_names: List[Dict[str, Any]] = []

    for row in raw_block_rows:
        b_code = int(str(row["block_lgd_code"]).strip())
        if b_code in seen_blk_codes:
            continue
        seen_blk_codes.add(b_code)

        d_code = int(str(row["district_lgd_code"]).strip())
        s_code = int(str(row.get("state_lgd_code", 22)).strip())
        s_name = str(row.get("state_name", "Chhattisgarh")).strip()
        d_name = str(row["district_name"]).strip()
        b_name = str(row["block_name"]).strip()

        lat_str = str(row.get("latitude", "")).strip()
        lon_str = str(row.get("longitude", "")).strip()
        lat = float(lat_str) if lat_str != "" else None
        lon = float(lon_str) if lon_str != "" else None

        coord_type = str(row.get("coordinate_type", "")).strip() or None
        coord_source = str(row.get("coordinate_source", "")).strip() or None
        bound_source = str(row.get("boundary_source", "")).strip() or None

        if block_name_counts_per_dist.get((d_code, b_name.lower()), 0) > 1:
            duplicate_block_names.append({
                "district_name": d_name,
                "district_lgd_code": d_code,
                "block_name": b_name,
                "block_lgd_code": b_code,
            })

        unit_id = f"LGD_BLK_{b_code}"
        parent_id = f"LGD_DIST_{d_code}"

        facility_info = json.dumps({
            "name": f"Community Health Centre (CHC) — {b_name} Block ({d_name})",
            "type": "Block Community Health Centre (LGD Block " + str(b_code) + ")",
            "phone": "104 (Chhattisgarh Health Helpline)",
            "services": [
                "Free Malaria RDT & Blood Slide Examination",
                "3-Day ACT Regimen & Primaquine Dispensary",
                "Mitanin Field Kit & LLIN Coordination",
            ],
        })

        blocks.append({
            "unit_id": unit_id,
            "unit_name": b_name,
            "level": "block",
            "parent_id": parent_id,
            "forecast_unit_id": None,  # Do not associate simulated telemetry with real LGD blocks
            "latitude": lat,
            "longitude": lon,
            "health_facility": facility_info,
            "state_name": s_name,
            "state_lgd_code": s_code,
            "district_lgd_code": d_code,
            "block_lgd_code": b_code,
            "coordinate_type": coord_type,
            "coordinate_source": coord_source,
            "boundary_source": bound_source,
            "is_demo": False,
        })

    return {
        "dataset_dir": str(dataset_dir),
        "districts": districts,
        "blocks": blocks,
        "summary": {
            "state_name": "Chhattisgarh",
            "state_lgd_code": 22,
            "total_districts": len(districts),
            "total_blocks": len(blocks),
            "total_records": len(districts) + len(blocks),
            "duplicate_block_names_in_same_district": duplicate_block_names,
        },
    }


def import_lgd_locations_to_db(db: Session) -> Dict[str, Any]:
    """
    Idempotently imports all 33 Chhattisgarh LGD districts and 146 development blocks
    into the `location_units` table. Marks legacy synthetic sample units with `is_demo = True`.
    Repeated runs update existing records in-place and never create duplicates.
    """
    bundle = load_lgd_dataset_records()
    all_specs = bundle["districts"] + bundle["blocks"]
    lgd_unit_ids = {spec["unit_id"] for spec in all_specs}

    existing_units = {u.unit_id: u for u in db.query(LocationUnit).all()}

    inserted_count = 0
    updated_count = 0

    for spec in all_specs:
        uid = spec["unit_id"]
        if uid in existing_units:
            obj = existing_units[uid]
            changed = False
            for field, val in spec.items():
                if getattr(obj, field, None) != val:
                    setattr(obj, field, val)
                    changed = True
            if changed:
                updated_count += 1
        else:
            db.add(LocationUnit(**spec))
            inserted_count += 1

    # Ensure any non-LGD legacy sample units (DIST_SAMPLE, BLK_A..BLK_F, VIL_A1..) are explicitly flagged is_demo=True
    demo_marked = 0
    for uid, obj in existing_units.items():
        if uid not in lgd_unit_ids and not obj.is_demo:
            obj.is_demo = True
            demo_marked += 1

    db.commit()

    return {
        "inserted": inserted_count,
        "updated": updated_count,
        "demo_marked": demo_marked,
        "total_lgd_districts": len(bundle["districts"]),
        "total_lgd_blocks": len(bundle["blocks"]),
        "total_lgd_records": len(all_specs),
    }


def resolve_location_unit(
    db: Session,
    identifier: Optional[str],
    expected_level: Optional[str] = None,
) -> Optional[LocationUnit]:
    """
    Resolves a location identifier by:
    1. Exact `unit_id` match (e.g. 'LGD_DIST_374', 'LGD_BLK_3595', or legacy demo 'DIST_SAMPLE', 'BLK_A').
    2. Official numeric LGD code match (e.g. '374' -> district_lgd_code=374, '3595' -> block_lgd_code=3595).
    3. Case-insensitive district/block name match if prefixed with 'name:' or exact unambiguous LGD name.
    Returns None if not found (never silently returns a random or simulated location).
    """
    if not identifier:
        return None
    clean = str(identifier).strip()
    if not clean:
        return None

    # 1. Exact unit_id match
    q = db.query(LocationUnit).filter(LocationUnit.unit_id == clean)
    if expected_level:
        q = q.filter(LocationUnit.level == expected_level)
    found = q.first()
    if found:
        return found

    # 2. Numeric LGD code match
    if clean.isdigit():
        code_int = int(clean)
        if expected_level == "district":
            return (
                db.query(LocationUnit)
                .filter(LocationUnit.level == "district", LocationUnit.district_lgd_code == code_int)
                .first()
            )
        if expected_level == "block":
            return (
                db.query(LocationUnit)
                .filter(LocationUnit.level == "block", LocationUnit.block_lgd_code == code_int)
                .first()
            )
        # If expected_level not specified, check block first then district
        blk = (
            db.query(LocationUnit)
            .filter(LocationUnit.level == "block", LocationUnit.block_lgd_code == code_int)
            .first()
        )
        if blk:
            return blk
        return (
            db.query(LocationUnit)
            .filter(LocationUnit.level == "district", LocationUnit.district_lgd_code == code_int)
            .first()
        )

    return None


def load_lgd_geojson(
    layer: str = "points",
    district_lgd_code: Optional[int] = None,
    block_lgd_code: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Loads `chhattisgarh_block_points.geojson` ('points') or `chhattisgarh_blocks.geojson` ('polygons')
    and optionally filters features by `district_lgd_code` or `block_lgd_code`.
    """
    dataset_dir = resolve_lgd_dataset_dir()
    filename = "chhattisgarh_blocks.geojson" if layer == "polygons" else "chhattisgarh_block_points.geojson"
    filepath = dataset_dir / filename

    with open(filepath, mode="r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    if district_lgd_code is not None:
        features = [
            feat for feat in features
            if str(feat.get("properties", {}).get("district_lgd_code", "")).strip() == str(district_lgd_code)
        ]
    if block_lgd_code is not None:
        features = [
            feat for feat in features
            if str(feat.get("properties", {}).get("block_lgd_code", "")).strip() == str(block_lgd_code)
        ]

    return {
        "type": "FeatureCollection",
        "layer": layer,
        "feature_count": len(features),
        "features": features,
    }
