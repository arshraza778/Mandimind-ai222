"""
Authentication, Password Hashing, Session Token Management, and Role/Jurisdiction Authorization
for Mitanin Signal.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Optional, List
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, AuthSession, LocationUnit

PBKDF2_ITERATIONS = 120_000


def hash_password(password: str, salt: Optional[str] = None) -> str:
    """Hashes a plaintext password using PBKDF2-HMAC-SHA256 with a random salt."""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    """Verifies a plaintext password against a stored PBKDF2-HMAC-SHA256 hash."""
    if not stored_hash or not password:
        return False
    try:
        parts = stored_hash.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = parts[2]
        expected_hex = parts[3]
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        )
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def create_user_session(db: Session, user: User, ttl_hours: int = 24) -> str:
    """Creates a persistent session token for an authenticated user."""
    raw_token = f"ms_{user.id}_{secrets.token_urlsafe(32)}"
    now = datetime.now(timezone.utc)
    session = AuthSession(
        token=raw_token,
        user_id=user.id,
        created_at=now,
        expires_at=now + timedelta(hours=ttl_hours),
        is_active=True,
    )
    db.add(session)
    db.commit()
    return raw_token


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Returns the authenticated User if a valid Bearer token is provided, else None."""
    token = extract_bearer_token(authorization)
    if not token:
        return None
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token == token, AuthSession.is_active == True)
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token.",
        )
    now = datetime.now(timezone.utc)
    exp = session.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now:
        session.is_active = False
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please log in again.",
        )
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user account not found.",
        )
    return user


def get_current_user(
    user: Optional[User] = Depends(get_optional_user),
) -> User:
    """Requires a valid authenticated user session."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in via the Employee Portal.",
        )
    return user


def require_field_employee(user: User = Depends(get_current_user)) -> User:
    """Requires the user to be a Field Employee / Mitanin."""
    if user.get_portal_role() != "field_employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Field Employee / Mitanin role required.",
        )
    return user


def require_supervisor(user: User = Depends(get_current_user)) -> User:
    """Requires the user to have an assigned Supervisor role."""
    if user.get_portal_role() != "supervisor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Supervisor role required. Field employees cannot access supervisor endpoints.",
        )
    return user


def get_authorized_block_ids(user: User, db: Session) -> List[str]:
    """Returns the list of block unit_ids that this user is authorized to access."""
    if user.role == "mitanin":
        blk = user.block_id or user.unit_id
        return [blk] if blk else ["BLK_A"]
    if user.role in ("block_supervisor", "supervisor"):
        blk = user.block_id or user.unit_id
        return [blk] if blk else ["BLK_A"]
    if user.role == "district_officer":
        dist_id = user.district_id or user.unit_id or "DIST_SAMPLE"
        blocks = (
            db.query(LocationUnit)
            .filter(LocationUnit.level == "block", LocationUnit.parent_id == dist_id)
            .all()
        )
        if blocks:
            return [b.unit_id for b in blocks]
        return ["BLK_A", "BLK_B", "BLK_C", "BLK_D", "BLK_E", "BLK_F"]
    return []


def verify_location_jurisdiction(
    user: User,
    db: Session,
    district_id: Optional[str] = None,
    block_id: Optional[str] = None,
    village_id: Optional[str] = None,
) -> None:
    """
    Strictly validates that an employee or supervisor is authorized to access the requested
    district, block, and village. Raises 403 HTTPException if outside their assigned jurisdiction.
    """
    from app.lgd_locations import resolve_location_unit

    canon_dist = resolve_location_unit(db, district_id, expected_level="district") if district_id else None
    check_dist_id = canon_dist.unit_id if canon_dist else district_id

    canon_blk = resolve_location_unit(db, block_id, expected_level="block") if block_id else None
    check_blk_id = canon_blk.unit_id if canon_blk else block_id

    user_dist = user.district_id or "DIST_SAMPLE"
    allowed_blocks = set(get_authorized_block_ids(user, db))

    if check_dist_id and check_dist_id != user_dist:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Jurisdiction violation: You are assigned to district '{user_dist}' and cannot access '{district_id}'.",
        )

    if check_blk_id and check_blk_id not in allowed_blocks:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Jurisdiction violation: You are not authorized to access block '{block_id}'. Allowed: {sorted(list(allowed_blocks))}.",
        )

    if village_id:
        vil = db.query(LocationUnit).filter(LocationUnit.unit_id == village_id).first()
        if not vil:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Village '{village_id}' not found.",
            )
        if vil.parent_id not in allowed_blocks:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Jurisdiction violation: Village '{village_id}' belongs to block '{vil.parent_id}', outside your jurisdiction.",
            )
        # If field employee has a specific assigned village, restrict to their block (or assigned village)
        if user.role == "mitanin" and user.village_id and village_id != user.village_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Jurisdiction violation: Field employee is assigned to village '{user.village_id}' and cannot access '{village_id}'.",
            )
