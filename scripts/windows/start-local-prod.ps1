$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install Node.js 22 LTS or newer, then run this script again."
  Write-Host "Download: https://nodejs.org/"
  exit 1
}

if (-not (Test-Path -LiteralPath ".env")) {
  Write-Host ".env was not found in $root." -ForegroundColor Red
  Write-Host "Create .env from .env.local.production.example and fill in your Supabase PostgreSQL URL and SESSION_SECRET."
  exit 1
}

if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host "node_modules was not found. Installing dependencies..."
  npm.cmd install
}

Write-Host ""
Write-Host "Local URL: http://localhost:3000"
Write-Host "Tunnel target: http://localhost:3000"
Write-Host "Worker URL: https://pack.personalizedgiftday.com"
Write-Host "Build config: npm run build reads .env and chooses the matching Prisma schema."
Write-Host ""

npm.cmd run build
npm.cmd start
