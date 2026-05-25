@echo off
setlocal

set "ROOT=%~dp0..\.."
cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 22 LTS or newer, then run this script again.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

if not exist ".env" (
  echo .env was not found in %ROOT%.
  echo Create .env from .env.local.production.example and fill in your Supabase PostgreSQL URL and SESSION_SECRET.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo node_modules was not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Local URL: http://localhost:3000
echo Tunnel target: http://localhost:3000
echo Worker URL: https://pack.personalizedgiftday.com
echo.

call npm run build
if errorlevel 1 (
  echo npm run build failed.
  pause
  exit /b 1
)

call npm start
endlocal
