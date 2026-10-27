"""JWT sign-in and role checks. Passwords are bcrypt hashes; tokens carry user, tenant and role."""

import datetime as dt
from dataclasses import dataclass

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.config import settings
from backend.db.session import anon_tx, one

ALGO = "HS256"
RANK = {"viewer": 0, "auditor": 0, "staff": 1, "officer": 2}

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class User:
    id: int
    tenant_id: int
    role: str
    name: str

    @property
    def actor(self) -> str:
        return "user:%d" % self.id


def _token(user: User, kind: str, lifetime: dt.timedelta) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {"sub": str(user.id), "tid": user.tenant_id, "role": user.role, "name": user.name,
              "typ": kind, "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, settings().jwt_secret, algorithm=ALGO)


def issue_tokens(user: User) -> dict:
    s = settings()
    return {
        "access_token": _token(user, "access", dt.timedelta(minutes=s.jwt_access_minutes)),
        "refresh_token": _token(user, "refresh", dt.timedelta(days=s.jwt_refresh_days)),
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "role": user.role, "tenant_id": user.tenant_id},
    }


def issue_mcp_token(user: User, days: int = 30) -> str:
    """Long-lived token for an MCP client (Claude Desktop). Read/propose only: the MCP server has no write tools."""
    return _token(user, "mcp", dt.timedelta(days=days))


def authenticate(email: str, password: str) -> User | None:
    with anon_tx() as conn:
        row = one(conn, "SELECT * FROM tl_auth_user(:e)", e=email.strip())
    if not row or not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        return None
    return User(row["id"], row["tenant_id"], row["role"], row["name"])


def decode(token: str, kind: str | tuple = "access") -> User:
    try:
        c = jwt.decode(token, settings().jwt_secret, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    if c.get("typ") not in ((kind,) if isinstance(kind, str) else kind):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return User(int(c["sub"]), int(c["tid"]), c["role"], c["name"])


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> User:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first")
    return decode(cred.credentials)


def require(min_role: str):
    def dep(user: User = Depends(current_user)) -> User:
        if RANK[user.role] < RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Needs the %s role" % min_role)
        return user
    return dep


viewer = require("viewer")
staff = require("staff")
officer = require("officer")
