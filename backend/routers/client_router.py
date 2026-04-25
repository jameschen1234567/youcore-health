"""
Client endpoints: read-only access to own analyses and video streaming.
"""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from database import get_conn
from auth import get_current_user

router = APIRouter(prefix="/client", tags=["client"])

STORAGE = Path(__file__).parent.parent / "storage"


@router.get("/analyses")
def my_analyses(user: dict = Depends(get_current_user)):
    client_id = user.get("client_id")
    # Admin can also call this but gets nothing (use /admin/clients/{id}/analyses instead)
    if not client_id:
        return []
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
def get_analysis(analysis_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "找不到此分析紀錄")

    # Clients can only access their own data
    if user["role"] == "client" and row["client_id"] != user.get("client_id"):
        raise HTTPException(403, "無存取權限")

    result = dict(row)
    if result.get("result_json"):
        result["result"] = json.loads(result["result_json"])
    return result


@router.get("/videos/{analysis_id}")
def stream_video(analysis_id: int, user: dict = Depends(get_current_user)):
    conn = get_conn()
    row = conn.execute(
        "SELECT video_path, client_id FROM analyses WHERE id=?", (analysis_id,)
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(404, "找不到影片")

    # Clients can only access their own videos
    if user["role"] == "client" and row["client_id"] != user.get("client_id"):
        raise HTTPException(403, "無存取權限")

    video_path = Path(row["video_path"]) if row["video_path"] else None
    if not video_path or not video_path.exists():
        raise HTTPException(404, "影片檔案不存在")

    def iter_file():
        with open(video_path, "rb") as f:
            while chunk := f.read(1024 * 256):  # 256 KB chunks
                yield chunk

    suffix = video_path.suffix.lower()
    media_type = "video/mp4" if suffix == ".mp4" else "video/quicktime" if suffix == ".mov" else "video/webm"

    return StreamingResponse(iter_file(), media_type=media_type)
