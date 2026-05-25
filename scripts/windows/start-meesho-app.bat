@echo off
setlocal
cd /d "%~dp0..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 22 LTS or newer, then run this file again.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)
node scripts\windows\start-local-prod.mjs
if errorlevel 1 pause
endlocal
