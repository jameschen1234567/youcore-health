@echo off
chcp 65001 >nul
title YouCore Backend (port 8000)
cd /d "%USERPROFILE%\motion-analysis\backend"
echo [INFO] 啟動 YouCore 動作分析後端...
"%USERPROFILE%\motion-analysis\backend\venv\Scripts\uvicorn.exe" main:app --host 0.0.0.0 --port 8000
pause
