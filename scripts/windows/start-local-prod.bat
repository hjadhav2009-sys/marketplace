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

set "DATABASE_URL_VALUE="
set "SESSION_COOKIE_SECURE_VALUE="
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="DATABASE_URL" set "DATABASE_URL_VALUE=%%B"
  if /i "%%A"=="SESSION_COOKIE_SECURE" set "SESSION_COOKIE_SECURE_VALUE=%%B"
)
set "DATABASE_URL_VALUE=%DATABASE_URL_VALUE:"=%"
set "SESSION_COOKIE_SECURE_VALUE=%SESSION_COOKIE_SECURE_VALUE:"=%"
set "BUILD_SCRIPT=build"
set "SCHEMA_NAME=prisma/schema.prisma"
echo %DATABASE_URL_VALUE% | findstr /i /b /c:"postgresql://" /c:"postgres://" >nul 2>nul
if not errorlevel 1 (
  set "BUILD_SCRIPT=build:prod"
  set "SCHEMA_NAME=prisma/schema.postgres.prisma"
)
if not defined SKIP_PRISMA_MIGRATE set "SKIP_PRISMA_MIGRATE=true"
if defined SESSION_COOKIE_SECURE (
  set "COOKIE_SECURE_MODE=%SESSION_COOKIE_SECURE%"
) else (
  if defined SESSION_COOKIE_SECURE_VALUE (
    set "COOKIE_SECURE_MODE=%SESSION_COOKIE_SECURE_VALUE%"
  ) else (
    set "SESSION_COOKIE_SECURE=false"
    set "COOKIE_SECURE_MODE=false"
  )
)

set "LOCAL_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R /C:"IPv4.*192\.168\." /C:"IPv4.*10\." /C:"IPv4.*172\."') do (
  if not defined LOCAL_IP set "LOCAL_IP=%%A"
)
set "LOCAL_IP=%LOCAL_IP: =%"

echo.
echo Local URL: http://localhost:3000
if defined LOCAL_IP (
  echo Mobile local URL: http://%LOCAL_IP%:3000
) else (
  echo Mobile local URL: not detected
)
echo Tunnel target: http://localhost:3000
echo Worker URL: https://pack.personalizedgiftday.com
echo Cookie secure mode: %COOKIE_SECURE_MODE%
echo Build config: .env DATABASE_URL selects %SCHEMA_NAME%.
echo Build command: npm run %BUILD_SCRIPT%
echo SKIP_PRISMA_MIGRATE=%SKIP_PRISMA_MIGRATE%
echo.

call npm run %BUILD_SCRIPT%
if errorlevel 1 (
  echo npm run %BUILD_SCRIPT% failed.
  pause
  exit /b 1
)

call npm start
endlocal
