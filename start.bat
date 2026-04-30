@echo off
chcp 65001 >nul
title YouCore 動作分析系統

:: ── 檢查 port 8000 是否已佔用 ────────────────────────────────
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do (
    echo [INFO] Port 8000 已被 PID %%a 佔用，先結束舊程序...
    taskkill /pid %%a /f >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── 啟動後端（FastAPI 同時 serve 前端 dist）────────────────────
echo [INFO] 啟動後端伺服器（port 8000）...
start "YouCore Backend" cmd /k "%USERPROFILE%\motion-analysis\run_backend.bat"

:: ── 等後端就緒再開瀏覽器 ──────────────────────────────────────
timeout /t 5 /nobreak >nul
echo [INFO] 開啟瀏覽器...
start http://localhost:8000
