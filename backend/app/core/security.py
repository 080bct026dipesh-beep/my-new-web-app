"""Auth for admin endpoints: a shared API key for scripted/ETL access,
plus per-admin JWT login for interactive use.

Originally just a single shared admin API key checked against a
request header. The per-admin login flow below (AdminUser + JWT) was
added afterward but, per the 2026-08-24 audit, was never actually
wired into any route -- POST /admin/login issued real tokens that
nothing ever verified. require_admin() below is the fix: it accepts
*either* credential, so existing scripted callers (X-Admin-Api-Key)
keep working unchanged, and a bearer token from /admin/login now
actually grants access too, with the specific AdminUser attached to
the request for future per-admin authorization/audit use.
"""

import secrets

from fastapi import Header, HTTPException, status

from .config import get_settings


def require_admin_key(x_admin_api_key: str = Header(..., alias="X-Admin-Api-Key")) -> None:
    """FastAPI dependency: raise 401 unless the header matches the
    configured admin key. Use `secrets.compare_digest` instead of `==`
    so the comparison runs in constant time and doesn't leak length
    information via a timing side-channel.

    Kept standalone (rather than folded into require_admin below) since
    a few call sites -- e.g. scripts/ETL -- may want the shared-key-only
    check with no JWT fallback. Most routes should use require_admin.
    """
    settings = get_settings()
    if not secrets.compare_digest(x_admin_api_key, settings.admin_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing admin API key.")


# ---------------------------------------------------------------------------
# AdminUser login (password hashing + JWT) -- separate from require_admin_key
# above. require_admin_key is still exported for callers that specifically
# want shared-key-only access; require_admin() (below) is what admin routes
# actually use, and accepts a JWT from this login flow as an alternative.
# ---------------------------------------------------------------------------
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import AdminUser

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer_scheme = HTTPBearer()
# auto_error=False: a missing Authorization header must fall through to
# the X-Admin-Api-Key check in require_admin() below, not raise on its
# own -- only require_admin() decides when both have failed.
_optional_bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(plain_password: str) -> str:
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return _pwd_context.verify(plain_password, password_hash)


def create_access_token(admin_id: int, username: str, role: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(admin_id), "username": username, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _decode_admin_token(token: str, db: Session) -> Optional[AdminUser]:
    """Shared decode logic for get_current_admin and require_admin.
    Returns None (never raises) on any invalid/expired/unknown token,
    so callers that want to fall back to another credential can do so;
    get_current_admin turns a None back into a 401 itself."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    return db.get(AdminUser, int(payload["sub"]))


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> AdminUser:
    """FastAPI dependency: decode the bearer token, load and return the
    AdminUser it names. Raises 401 on any invalid/expired/unknown token."""
    admin = _decode_admin_token(credentials.credentials, db)
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")
    return admin


def require_admin(
    x_admin_api_key: Optional[str] = Header(None, alias="X-Admin-Api-Key"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[AdminUser]:
    """FastAPI dependency for admin routes: accepts EITHER the shared
    X-Admin-Api-Key header OR a bearer JWT from POST /admin/login.

    - Valid shared key -> returns None (scripted/ETL caller, no single
      admin identity -- this is the same access existing callers have
      always had, unchanged).
    - Valid bearer token -> returns the AdminUser it names, so routes
      can use `admin.username` / `admin.role` for logging or
      authorization once that's needed.
    - Neither present or both invalid -> 401.

    This is what actually wires get_current_admin's JWT verification
    into a live endpoint (see app/api/admin.py) -- previously
    POST /admin/login issued tokens that nothing ever checked.
    """
    settings = get_settings()
    if x_admin_api_key is not None and secrets.compare_digest(x_admin_api_key, settings.admin_api_key):
        return None

    if credentials is not None:
        admin = _decode_admin_token(credentials.credentials, db)
        if admin is not None:
            return admin

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing admin credentials (X-Admin-Api-Key header or bearer token).",
    )
