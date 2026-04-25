from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import tempfile, os, traceback, logging, threading, uuid, json, asyncio, shutil

from database import init_db, get_conn, DB_PATH
from auth import get_current_user, require_admin
from routers.auth_router import router as auth_router
from routers.admin_router import router as admin_router
from routers.client_router import router as client_router
from pose_analyzer import analyze_video_file
from pdf_report import generate_pdf_report

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

# ── Init DB ───────────────────────────────────────────────────────────────────
init_db()
log.info("Database initialised")

app = FastAPI(title="YouCore Motion Analysis API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(client_router)

TMP = Path(tempfile.gettempdir()) / "motion_analysis"
TMP.mkdir(exist_ok=True)

STORAGE   = Path(__file__).parent / "storage"
VIDEOS    = STORAGE / "videos"
BACKUPS   = STORAGE / "backups"
VIDEOS.mkdir(parents=True, exist_ok=True)
BACKUPS.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
MAX_SIZE    = 500 * 1024 * 1024
VALID_MODES = {'balance', 'jump'}

# ── Job store ─────────────────────────────────────────────────────────────────
_jobs:   dict = {}
_uploads: dict = {}


# ── Auto-backup (daily) ───────────────────────────────────────────────────────
def _run_backup():
    import schedule, time
    from datetime import date

    def backup():
        if not DB_PATH.exists():
            return
        dest = BACKUPS / f"youcore_{date.today().strftime('%Y%m%d')}.db"
        shutil.copy2(str(DB_PATH), str(dest))
        log.info(f"DB backed up → {dest.name}")
        # Remove backups older than 30 days
        cutoff = date.today().toordinal() - 30
        for f in BACKUPS.glob("youcore_*.db"):
            try:
                d = int(f.stem.replace("youcore_", ""))
                from datetime import date as dt
                file_date = dt(d // 10000, (d % 10000) // 100, d % 100)
                if file_date.toordinal() < cutoff:
                    f.unlink()
                    log.info(f"Removed old backup: {f.name}")
            except Exception:
                pass

    schedule.every().day.at("02:00").do(backup)
    while True:
        schedule.run_pending()
        time.sleep(60)

threading.Thread(target=_run_backup, daemon=True).start()


# ── Analysis job ──────────────────────────────────────────────────────────────
def _run_job(job_id: str, tmp_path: Path, mode: str,
             client_id: int | None = None, keep_video: bool = False):
    def progress_cb(pct: int):
        _jobs[job_id]['progress'] = pct
        _jobs[job_id]['message']  = f'分析中 {pct}%'

    video_dest = None
    try:
        result = analyze_video_file(str(tmp_path), progress_cb=progress_cb, mode=mode)

        # Persist video if client_id provided
        if client_id:
            client_dir = VIDEOS / str(client_id)
            client_dir.mkdir(parents=True, exist_ok=True)
            ext = tmp_path.suffix
            video_dest = client_dir / f"{job_id}{ext}"
            shutil.copy2(str(tmp_path), str(video_dest))

        # Save analysis to DB
        if client_id:
            conn = get_conn()
            conn.execute(
                """INSERT INTO analyses
                   (client_id, mode, video_path, result_json, duration, fps, total_frames)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    client_id, mode,
                    str(video_dest) if video_dest else None,
                    json.dumps(result),
                    result.get("duration"), result.get("fps"), result.get("total_frames"),
                ),
            )
            conn.commit()
            conn.close()

        _jobs[job_id].update(status='done', progress=100, message='分析完成', result=result)
        log.info(f'Job {job_id} ({mode}) done: {result["total_frames"]} frames')
    except Exception as e:
        tb = traceback.format_exc()
        log.error(f'Job {job_id} failed:\n{tb}')
        _jobs[job_id].update(status='error', message=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "tmp": str(TMP)}


# ── Chunked upload ─────────────────────────────────────────────────────────────

@app.post("/upload/start")
async def upload_start(
    filename:  str = Form(...),
    mode:      str = Form('balance'),
    client_id: int = Form(None),
    user: dict = Depends(require_admin),
):
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支援格式 '{ext}'")
    if mode not in VALID_MODES:
        mode = 'balance'
    upload_id = str(uuid.uuid4())[:8]
    tmp_path  = TMP / f"chunk_{upload_id}{ext}"
    tmp_path.write_bytes(b'')
    _uploads[upload_id] = {'path': tmp_path, 'mode': mode, 'client_id': client_id}
    log.info(f"Upload started: {upload_id}  file={filename}  mode={mode}  client={client_id}")
    return {"upload_id": upload_id}


@app.post("/upload/chunk")
async def upload_chunk(
    upload_id:   str        = Form(...),
    chunk_index: int        = Form(...),
    chunk:       UploadFile = File(...),
    user: dict = Depends(require_admin),
):
    if upload_id not in _uploads:
        raise HTTPException(404, "upload_id 不存在或已過期")
    data = await chunk.read()
    if not data:
        raise HTTPException(400, "空 chunk")
    with open(_uploads[upload_id]['path'], 'ab') as f:
        f.write(data)
    log.info(f"Chunk {chunk_index}: upload_id={upload_id}  size={len(data)/1024:.0f} KB")
    return {"ok": True, "chunk": chunk_index}


@app.post("/upload/finish")
async def upload_finish(
    upload_id: str = Form(...),
    user: dict = Depends(require_admin),
):
    if upload_id not in _uploads:
        raise HTTPException(404, "upload_id 不存在或已過期")
    info      = _uploads.pop(upload_id)
    tmp_path  = info['path']
    mode      = info['mode']
    client_id = info.get('client_id')
    size_mb   = tmp_path.stat().st_size / 1024 / 1024
    log.info(f"Upload finished: {upload_id}  total={size_mb:.1f} MB  mode={mode}")

    if tmp_path.stat().st_size == 0:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(400, "組合後的檔案為空")

    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        'status': 'processing', 'progress': 0,
        'message': '排隊中…', 'result': None, 'error': None, 'mode': mode,
    }
    threading.Thread(
        target=_run_job, args=(job_id, tmp_path, mode, client_id), daemon=True
    ).start()
    return {"job_id": job_id}


@app.post("/analyze")
async def analyze(
    file:      UploadFile = File(...),
    mode:      str        = Form('balance'),
    client_id: int        = Form(None),
    user: dict = Depends(require_admin),
):
    filename = file.filename or ''
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支援格式 '{ext}'，請使用 mp4 / mov / avi / mkv")
    if mode not in VALID_MODES:
        mode = 'balance'

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "收到空檔案")
    if len(content) > MAX_SIZE:
        raise HTTPException(413, "檔案過大（上限 500 MB）")

    job_id   = str(uuid.uuid4())[:8]
    tmp_path = TMP / f"upload_{job_id}{ext}"
    tmp_path.write_bytes(content)

    _jobs[job_id] = {
        'status': 'processing', 'progress': 0,
        'message': '準備中', 'result': None, 'error': None,
    }
    threading.Thread(
        target=_run_job, args=(job_id, tmp_path, mode, client_id), daemon=True
    ).start()
    log.info(f"Job {job_id} started (mode={mode}  client={client_id})")
    return {"job_id": job_id}


@app.get("/poll/{job_id}")
async def job_poll(job_id: str, user: dict = Depends(get_current_user)):
    if job_id not in _jobs:
        raise HTTPException(404, "找不到此 job")
    job = _jobs[job_id]
    return {
        'status':   job.get('status', 'processing'),
        'progress': job.get('progress', 0),
        'message':  job.get('message', ''),
        'error':    job.get('error') or job.get('message', '') if job.get('status') == 'error' else None,
        'result':   job.get('result') if job.get('status') == 'done' else None,
    }


@app.get("/status/{job_id}")
async def job_status(job_id: str, user: dict = Depends(get_current_user)):
    if job_id not in _jobs:
        raise HTTPException(404, "找不到此 job")

    async def event_stream():
        while True:
            job     = _jobs.get(job_id, {})
            status  = job.get('status', 'processing')
            payload = {'status': status, 'progress': job.get('progress', 0), 'message': job.get('message', '')}
            if status == 'done':
                payload['result'] = job.get('result')
            elif status == 'error':
                payload['error'] = job.get('message', '未知錯誤')
            yield f"data: {json.dumps(payload)}\n\n"
            if status in ('done', 'error'):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/generate-pdf")
async def generate_pdf(data: dict, user: dict = Depends(get_current_user)):
    pdf_path = TMP / f"report_{os.getpid()}.pdf"
    try:
        generate_pdf_report(data, str(pdf_path), client_name=data.get('client_name', ''))
        return FileResponse(str(pdf_path), media_type="application/pdf",
                            filename="motion_analysis_report.pdf")
    except Exception as e:
        log.error(traceback.format_exc())
        raise HTTPException(500, f"PDF 產生失敗: {e}")


# ── Serve frontend (must be LAST) ─────────────────────────────────────────────
_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        f = _DIST / "favicon.ico"
        return FileResponse(str(f)) if f.exists() else FileResponse(str(_DIST / "icon-192.png"))

    @app.get("/manifest.json", include_in_schema=False)
    async def manifest():
        return FileResponse(str(_DIST / "manifest.json"))

    @app.get("/icon-192.png", include_in_schema=False)
    async def icon192():
        return FileResponse(str(_DIST / "icon-192.png"))

    @app.get("/icon-512.png", include_in_schema=False)
    async def icon512():
        return FileResponse(str(_DIST / "icon-512.png"))

    @app.get("/", include_in_schema=False)
    async def spa_root():
        return FileResponse(str(_DIST / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(str(_DIST / "index.html"))
