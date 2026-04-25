@echo off
start "YouCore Backend"  cmd /k "%USERPROFILE%\motion-analysis\run_backend.bat"
timeout /t 8 /nobreak >nul
start "YouCore Frontend" cmd /k "%USERPROFILE%\motion-analysis\run_frontend.bat"
timeout /t 6 /nobreak >nul
start http://localhost:5173
