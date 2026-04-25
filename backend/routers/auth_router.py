"""
Auth endpoints: /auth/login, /auth/me
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_conn
from auth import verify_password, create_token, get_current_user, hash_password, require_admin

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login")
def login(body: LoginRequest):
    conn = get_conn()
    row = conn.execute(
        "SELECT id, username, hashed_pw, role, client_id FROM users WHERE username=?",
        (body.username,),
    ).fetchone()
    conn.close()

    if not row or not verify_password(body.password, row["hashed_pw"]):
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    token = create_token(row["id"], row["username"], row["role"], row["client_id"])
    return {
        "access_token": token,
        "token_type":   "bearer",
        "role":         row["role"],
        "username":     row["username"],
        "client_id":    row["client_id"],
    }


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {
        "id":        user["sub"],
        "username":  user["username"],
        "role":      user["role"],
        "client_id": user.get("client_id"),
    }


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    conn = get_conn()
    row = conn.execute(
        "SELECT hashed_pw FROM users WHERE id=?", (user["sub"],)
    ).fetchone()

    if not row or not verify_password(body.old_password, row["hashed_pw"]):
        conn.close()
        raise HTTPException(status_code=400, detail="舊密碼錯誤")

    if len(body.new_password) < 6:
        conn.close()
        raise HTTPException(status_code=400, detail="新密碼至少需要 6 個字元")

    conn.execute(
        "UPDATE users SET hashed_pw=? WHERE id=?",
        (hash_password(body.new_password), user["sub"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True}
