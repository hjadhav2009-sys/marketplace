$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install Node.js 22 LTS or newer, then run this script again."
  Write-Host "Download: https://nodejs.org/"
  exit 1
}

node scripts/windows/start-local-prod.mjs
if ($LASTEXITCODE -ne 0) {
  Read-Host "Press Enter to close"
  exit $LASTEXITCODE
}
