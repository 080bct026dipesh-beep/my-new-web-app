"""Login endpoint for AdminUser accounts (JWT-based).

Separate from app/api/admin.py: that router (and POST /admin/rebuild-graph
in app/main.py) is protected by require_admin, which accepts this
endpoint's JWT as well as the older shared X-Admin-Api-Key secret. This
router itself is intentionally unprotected (you need to log in before
you have a token).
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models import AdminUser

from app.schemas import AdminLoginRequest, AdminTokenResponse

router = APIRouter()


@router.post("/admin/login", response_model=AdminTokenResponse)
@limiter.limit("5/minute")
def login(request: Request, payload: AdminLoginRequest, db: Session = Depends(get_db)) -> AdminTokenResponse:
    admin = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))
    if admin is None or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    token = create_access_token(admin_id=admin.admin_id, username=admin.username, role=admin.role)
    return AdminTokenResponse(access_token=token)
