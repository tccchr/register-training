@echo off
chcp 65001 >nul
echo Starting Course Reservation System...
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules\" (
  echo.
  echo [Setup] node_modules not found - installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo [Error] npm install failed. Please check internet connection.
    pause
    exit /b 1
  )
)

REM Check if @dnd-kit exists (new dependency)
if not exist "node_modules\@dnd-kit\core\package.json" (
  echo.
  echo [Setup] dnd-kit not found - installing...
  call npm install
)

REM Check if vite exists
if not exist "node_modules\.bin\vite.cmd" (
  echo.
  echo [Setup] Vite not found - reinstalling...
  call npm install
)

echo.
echo [Run] Starting Dev Server...
call npm run dev -- --open
