from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.app.auth import User, authenticate, current_user, decode, issue_tokens
from backend.app.deps import limiter
from backend.db.session import audit, tenant_tx

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Login(BaseModel):
    email: str
    password: str


class Refresh(BaseModel):
    refresh_token: str


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: Login):
    user = authenticate(body.email, body.password)
    if not user:
        raise HTTPException(401, "Email or password is wrong")
    with tenant_tx(user.tenant_id) as c:
        audit(c, user.tenant_id, user.actor, "login")
    return issue_tokens(user)


@router.post("/refresh")
def refresh(body: Refresh):
    return issue_tokens(decode(body.refresh_token, "refresh"))


@router.get("/me")
def me(user: User = Depends(current_user)):
    with tenant_tx(user.tenant_id) as c:
        from backend.db.session import rows

        factories = rows(c, "SELECT id, name FROM factories ORDER BY id")
    return {"id": user.id, "name": user.name, "role": user.role, "tenant_id": user.tenant_id, "factories": factories}
