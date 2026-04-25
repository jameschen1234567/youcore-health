"""
JWT authentication helpers.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from jose import JWTError, jwt

from database import get_conn

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY  = "youcore-secret-key-change-in-production-2025"
ALGORITHM   = "HS256"
EXPIRE_DAYS = 7

bearer = HTTPBearer(auto_error=False)

# ── Password ──────────────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(user_id: int, username: str, role: str, client_id: Optional[int]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=EXPIRE_DAYS)
    payload = {
        "sub":       str(user_id),
        "username":  username,
        "role":      role,
        "client_id": client_id,
        "exp":       expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 無效或已過期")

# ── Dependency ────────────────────────────────────────────────────────────────

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="請先登入")
    return decode_token(creds.credentials)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理員權限")
    return user


def require_client(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "client"):
        raise HTTPException(status_code=403, detail="權限不足")
    return user
