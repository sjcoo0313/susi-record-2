@echo off
cd /d "%~dp0"
chcp 65001 >nul
title 고3 수시 6장 대학 지원 관리기 (UniCard Tracker)

echo ========================================================
echo   🎓 고3 수시 6장 대학 지원 관리 시스템 실행 중...
echo ========================================================
echo.

set "PATH=C:\Program Files\nodejs;%PATH%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js 경로를 찾지 못했습니다. 
    echo     C:\Program Files\nodejs 폴더를 확인해주세요.
    pause
    exit /b
)

echo [*] 서버를 실행하고 웹 브라우저를 엽니다...
echo [*] 주소: http://localhost:3000
echo.

:: 1.5초 후 브라우저 자동 오픈
start "" "http://localhost:3000"

:: 서버 실행
node server/index.js

pause
