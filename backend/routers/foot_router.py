"""
POST /foot/measure：LIFF 客戶 App 上傳一張 A4 紙足部照片，回傳足長、足寬。

- 驗證：Authorization: Bearer <Supabase access token>
    * 有設 SUPABASE_URL → 以專案 JWKS 公鑰驗證（ES256 / RS256，新制）
    * 有設 SUPABASE_JWT_SECRET → 以舊制 HS256 secret 驗證
- 限制：檔案 ≤ 10 MB、僅 JPEG / PNG、同一使用者每分鐘最多 10 次
- 照片不保存（前端另外上傳到 Supabase Storage）
"""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict, deque

import jwt
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from foot_measure import FootMeasureError, decode_image, measure_foot

log = logging.getLogger(__name__)
router = APIRouter(prefix="/foot", tags=["foot"])

MAX_BYTES = 10 * 1024 * 1024
RATE_LIMIT, RATE_WINDOW_S = 10, 60
ALLOWED_TYPES = {"image/jpeg", "image/png"}

bearer = HTTPBearer(auto_error=False)
_jwks_client: jwt.PyJWKClient | None = None


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_client


def verify_supabase_token(token: str) -> str:
    """驗證 Supabase access token，回傳使用者 id（sub）。"""
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise jwt.InvalidTokenError("未設定 SUPABASE_JWT_SECRET")
            claims = jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
        else:
            if not os.environ.get("SUPABASE_URL"):
                raise jwt.InvalidTokenError("未設定 SUPABASE_URL")
            key = _jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated")
    except jwt.PyJWTError as e:
        log.info("foot auth rejected: %s", e)
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "登入已過期，請重新開啟"})
    return claims["sub"]


def _dev_bypass() -> bool:
    # 只給本機開發用；Render 上（有 RENDER 環境變數）一律無效
    return os.environ.get("FOOT_DEV_NO_AUTH") == "1" and not os.environ.get("RENDER")


def current_user_id(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if _dev_bypass():
        return "dev-user"
    if not creds:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "請先登入"})
    return verify_supabase_token(creds.credentials)


class RateLimiter:
    def __init__(self, limit: int, window_s: float):
        self.limit, self.window = limit, window_s
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True


limiter = RateLimiter(RATE_LIMIT, RATE_WINDOW_S)


@router.post("/measure")
async def measure(
    file: UploadFile = File(...),
    side: str = Form(...),
    user_id: str = Depends(current_user_id),
):
    if side not in ("left", "right"):
        raise HTTPException(status_code=422, detail={"code": "BAD_SIDE", "message": "side 必須是 left 或 right"})
    if not limiter.allow(user_id):
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": "太頻繁了，請 1 分鐘後再試"})
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FORMAT", "message": "請上傳 JPG 或 PNG 照片"})

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail={"code": "FILE_TOO_LARGE", "message": "照片超過 10 MB"})

    try:
        result = measure_foot(decode_image(data))
    except FootMeasureError as e:
        raise HTTPException(status_code=422, detail={"code": e.code, "message": e.detail})
    return {"side": side, **result.to_dict()}
