@echo off
chcp 65001 >nul
echo =============================================
echo   動作分析系統 - 首次安裝
echo   YouCore Health Advisors
echo =============================================
echo.

echo [1/3] 建立 Python 虛擬環境並安裝套件...
cd /d "%~dp0backend"
python -m venv venv
if errorlevel 1 (
  echo 錯誤：找不到 Python，請先安裝 Python 3.9+
  pause & exit /b 1
)
call venv\Scripts\activate
pip install -r requirements.txt
if errorlevel 1 (
  echo 錯誤：pip install 失敗，請確認網路連線
  pause & exit /b 1
)
echo.

echo [2/3] 安裝前端 Node 套件...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
  echo 錯誤：npm install 失敗，請先安裝 Node.js 18+
  pause & exit /b 1
)
echo.

echo [3/3] 安裝完成！
echo.
echo 下次啟動請執行 start.bat
echo.
pause
