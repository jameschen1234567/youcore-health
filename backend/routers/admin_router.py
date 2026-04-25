"""
Admin endpoints: client management, analysis history.
"""
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import get_conn
from auth import require_admin, hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name:     str
    birthday: Optional[str] = None
    gender:   Optional[str] = None
    weight:   Optional[float] = None
    height:   Optional[float] = None
    notes:    Optional[str] = None
    # 同時建立登入帳號（選填）
    username: Optional[str] = None
    password: Optional[str] = None


class ClientUpdate(BaseModel):
    name:     Optional[str] = None
    birthday: Optional[str] = None
    gender:   Optional[str] = None
    weight:   Optional[float] = None
    height:   Optional[float] = None
    notes:    Optional[str] = None


# ── Clients ───────────────────────────────────────────────────────────────────

@router.get("/clients")
def list_clients(user: dict = Depends(require_admin)):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name, birthday, gender, weight, height, notes, created_at FROM clients ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/clients")
def create_client(body: ClientCreate, user: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO clients (name, birthday, gender, weight, height, notes) VALUES (?,?,?,?,?,?)",
            (body.name, body.birthday, body.gender, body.weight, body.height, body.notes),
        )
        client_id = cur.lastrowid

        # 選填：同時建立登入帳號
        if body.username and body.password:
            if len(body.password) < 6:
                raise HTTPException(400, "密碼至少需要 6 個字元")
            existing = conn.execute("SELECT id FROM users WHERE username=?", (body.username,)).fetchone()
            if existing:
                raise HTTPException(400, f"帳號 '{body.username}' 已存在")
            conn.execute(
                "INSERT INTO users (username, hashed_pw, role, client_id) VALUES (?,?,'client',?)",
                (body.username, hash_password(body.password), client_id),
            )

        conn.commit()
        return {"id": client_id, "name": body.name}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.put("/clients/{client_id}")
def update_client(client_id: int, body: ClientUpdate, user: dict = Depends(require_admin)):
    conn = get_conn()
    row = conn.execute("SELECT id FROM clients WHERE id=?", (client_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "找不到此客戶")

    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if fields:
        sets = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE clients SET {sets} WHERE id=?", (*fields.values(), client_id))
        conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, user: dict = Depends(require_admin)):
    conn = get_conn()
    conn.execute("DELETE FROM clients WHERE id=?", (client_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Analyses ──────────────────────────────────────────────────────────────────

@router.get("/clients/{client_id}/analyses")
def client_analyses(client_id: int, user: dict = Depends(require_admin)):
    conn = get_conn()
    rows = conn.execute(
        """SELECT id, client_id, mode, video_path, duration, fps,
                  total_frames, created_at
           FROM analyses WHERE client_id=? ORDER BY created_at DESC""",
        (client_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: int, user: dict = Depends(require_admin)):
    conn = get_conn()
    row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "找不到此分析紀錄")
    result = dict(row)
    if result.get("result_json"):
        result["result"] = json.loads(result["result_json"])
    return result


@router.delete("/analyses/{analysis_id}")
def delete_analysis(analysis_id: int, user: dict = Depends(require_admin)):
    conn = get_conn()
    conn.execute("DELETE FROM analyses WHERE id=?", (analysis_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
