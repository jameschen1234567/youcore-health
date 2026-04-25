@echo off
cd /d "%USERPROFILE%\motion-analysis\backend"
call "%USERPROFILE%\motion-analysis\backend\venv\Scripts\activate.bat"
uvicorn main:app --host 0.0.0.0 --port 8000
pause
