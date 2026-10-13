"""
Database engine, session management, and table initialization
"""

import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.db.models import Base

# Database path in backend/data/mitanin_signal.db
backend_dir = Path(__file__).resolve().parent.parent.parent
data_dir = backend_dir / "data"
data_dir.mkdir(parents=True, exist_ok=True)
db_path = data_dir / "mitanin_signal.db"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _ensure_columns(conn, table_name: str, column_defs: dict):
    """Safely adds missing columns to an existing SQLite table."""
    try:
        res = conn.execute(text(f"PRAGMA table_info({table_name})"))
        existing_cols = {row[1] for row in res.fetchall()}
        if not existing_cols:
            return
        for col_name, col_sql in column_defs.items():
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_sql}"))
                conn.commit()
    except Exception:
        pass


def init_db():
    """Create all tables and perform safe schema migrations."""
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        _ensure_columns(conn, "alerts", {
            "disease_type": "VARCHAR(32) DEFAULT 'malaria'",
            "trigger_reason": "TEXT",
            "recommended_actions": "TEXT",
            "status": "VARCHAR(32) DEFAULT 'active'",
            "feedback_notes": "TEXT",
            "updated_at": "DATETIME",
            "updated_by": "VARCHAR(128)",
        })
        _ensure_columns(conn, "users", {
            "username": "VARCHAR(64)",
            "password_hash": "VARCHAR(256)",
            "district_id": "VARCHAR(64)",
            "block_id": "VARCHAR(64)",
            "village_id": "VARCHAR(64)",
            "supervisor_id": "INTEGER",
            "phone": "VARCHAR(32)",
            "designation": "VARCHAR(128)",
            "preferred_language": "VARCHAR(16) DEFAULT 'en'",
        })
        _ensure_columns(conn, "tasks", {
            "disease_type": "VARCHAR(32) DEFAULT 'malaria'",
            "description": "TEXT",
            "instructions": "TEXT",
            "owner_id": "INTEGER",
            "assigned_by": "VARCHAR(128) DEFAULT 'Supervisor [SAMPLE]'",
            "priority": "VARCHAR(32) DEFAULT 'High'",
            "district_id": "VARCHAR(64)",
            "block_id": "VARCHAR(64)",
            "village_id": "VARCHAR(64)",
            "location_name": "VARCHAR(255)",
            "completion_notes": "TEXT",
            "evidence_attachment": "TEXT",
        })
        _ensure_columns(conn, "field_reports", {
            "disease_type": "VARCHAR(32) DEFAULT 'malaria'",
            "suspected_cases": "INTEGER DEFAULT 0",
            "emerging_concern": "BOOLEAN DEFAULT 0",
        })
        _ensure_columns(conn, "location_units", {
            "state_name": "VARCHAR(64) DEFAULT 'Chhattisgarh'",
            "state_lgd_code": "INTEGER DEFAULT 22",
            "district_lgd_code": "INTEGER",
            "block_lgd_code": "INTEGER",
            "coordinate_type": "VARCHAR(128)",
            "coordinate_source": "VARCHAR(255)",
            "boundary_source": "VARCHAR(255)",
            "is_demo": "BOOLEAN DEFAULT 0",
        })


def get_db():
    """FastAPI dependency to get a database session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
