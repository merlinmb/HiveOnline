<#
.SYNOPSIS
  Start the Hive Online development servers.

.DESCRIPTION
  Runs the Express/Socket.IO API with tsx watch on port 3000 and the Vite
  development server on port 5173. Open http://localhost:5173 to play.

  The SQLite database and config are local to this folder (data/ and config/)
  and are not touched by a deployment.
#>
[CmdletBinding()]
param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found. Install Node.js 22 or newer."
}

$nodeVersion = (& node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 22) {
  Write-Warning "Node.js $nodeVersion is installed; Hive Online targets Node.js 22 or newer."
}

if ($Install -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  & npm ci
  if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed."
  }
}

Write-Host ""
Write-Host "Starting Hive Online development servers" -ForegroundColor Green
Write-Host "  App:    http://localhost:5173"
Write-Host "  API:    http://localhost:3000"
Write-Host "  Stop:   Ctrl+C"
Write-Host ""

& npm run dev
exit $LASTEXITCODE
