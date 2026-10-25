<#
.SYNOPSIS
  Build and deploy Hive Online to the Docker host at homebridge.local.

.DESCRIPTION
  Copies the application source to the remote host, writes the deployment
  compose file, builds the image on the host and (re)starts the container.
  Persistent state stays in <RemoteRoot>/data and <RemoteRoot>/config; the
  source is refreshed in <RemoteRoot>/site on every deploy.

.PARAMETER Remote
  SSH destination, for example pi@homebridge.local.

.PARAMETER RemoteRoot
  Root directory for the deployment on the remote host.

.PARAMETER Port
  Host port exposed by the container. Defaults to 8085 because 8080 is already
  used on the target host.

.PARAMETER PublicUrl
  Public URL written into the container environment. Defaults to
  http://homebridge.local:<Port>.

.PARAMETER ConfigFile
  Optional local app.json to upload. Without it, the remote config is created
  from config.example.json the first time, and an existing file is preserved.

.PARAMETER SkipHealthCheck
  Do not wait for the public health endpoint after deployment.

.EXAMPLE
  .\deploy.ps1

.EXAMPLE
  .\deploy.ps1 -Port 8090 -PublicUrl http://homebridge.local:8090

.EXAMPLE
  .\deploy.ps1 -ConfigFile .\config\app.json
#>
[CmdletBinding()]
param(
  [string]$Remote = "pi@homebridge.local",
  [string]$RemoteRoot = "/home/pi/portainer_data/hive",
  [ValidateRange(1, 65535)]
  [int]$Port = 8085,
  [string]$PublicUrl = "",
  [string]$ConfigFile = "",
  [string]$TimeZone = "Europe/London",
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = $PSScriptRoot
if (-not $PublicUrl) {
  $PublicUrl = "http://homebridge.local:$Port"
}
if ($ConfigFile) {
  $ConfigFile = (Resolve-Path -LiteralPath $ConfigFile).Path
}

foreach ($tool in @("ssh", "scp", "tar")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required command '$tool' was not found in PATH."
  }
}

$staging = Join-Path $env:TEMP ("hive-online-site-" + [guid]::NewGuid().ToString("N"))
$archive = Join-Path $env:TEMP ("hive-online-site-" + [guid]::NewGuid().ToString("N") + ".tar.gz")
$envFile = Join-Path $env:TEMP ("hive-online-env-" + [guid]::NewGuid().ToString("N"))

$sourceItems = @(
  "Dockerfile",
  ".dockerignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "config.example.json",
  "public",
  "scripts",
  "server",
  "shared",
  "src"
)

try {
  Write-Host "Preparing source archive..." -ForegroundColor Cyan
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  foreach ($item in $sourceItems) {
    $source = Join-Path $projectRoot $item
    if (-not (Test-Path -LiteralPath $source)) {
      throw "Missing required source item: $source"
    }
    Copy-Item -LiteralPath $source -Destination $staging -Recurse -Force
  }

  & tar -czf $archive -C $staging .
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the source archive (tar exited with $LASTEXITCODE)."
  }

  Write-Host "Creating remote directories..." -ForegroundColor Cyan
  $prepare = "set -euo pipefail; mkdir -p '$RemoteRoot/site' '$RemoteRoot/data' '$RemoteRoot/config'; rm -rf '$RemoteRoot/site'; mkdir -p '$RemoteRoot/site'"
  & ssh $Remote $prepare
  if ($LASTEXITCODE -ne 0) {
    throw "Could not prepare $RemoteRoot on $Remote."
  }

  Write-Host "Uploading source..." -ForegroundColor Cyan
  & scp -q $archive "${Remote}:/tmp/hive-online-site.tar.gz"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not upload the source archive."
  }

  & ssh $Remote "set -euo pipefail; tar -xzf /tmp/hive-online-site.tar.gz -C '$RemoteRoot/site'; rm -f /tmp/hive-online-site.tar.gz"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not extract the source archive on $Remote."
  }

  Write-Host "Uploading deployment files..." -ForegroundColor Cyan
  & scp -q (Join-Path $projectRoot "deploy/compose.yml") "${Remote}:$RemoteRoot/docker-compose.yml"
  & scp -q (Join-Path $projectRoot "deploy/remote-deploy.sh") "${Remote}:$RemoteRoot/remote-deploy.sh"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not upload the deployment files."
  }

  Write-Host "Merging deployment environment..." -ForegroundColor Cyan
  $remoteEnv = @()
  & ssh $Remote "cat '$RemoteRoot/.env' 2>/dev/null" | ForEach-Object { $remoteEnv += $_ }
  # A missing .env is fine; ssh exits non-zero in that case.

  $values = [ordered]@{}
  foreach ($line in $remoteEnv) {
    $trimmed = "$line".Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }
    $split = $trimmed.IndexOf('=')
    if ($split -lt 1) {
      continue
    }
    $values[$trimmed.Substring(0, $split)] = $trimmed.Substring($split + 1)
  }

  # These keys are owned by the deploy script and are refreshed every time.
  $deploymentOwned = @("HIVE_PORT", "PUBLIC_URL", "TZ")
  $managedDefaults = [ordered]@{
    HIVE_PORT          = "$Port"
    PUBLIC_URL         = $PublicUrl
    TZ                 = $TimeZone
    MAIL_MODE          = "smtp"
    SMTP_HOST          = "mailpit"
    SMTP_PORT          = "1025"
    SMTP_SECURE        = "false"
    SMTP_ALLOW_NO_AUTH = "true"
    SMTP_FROM          = "admin@parkm8.com"
    ZEPTOMAIL_API_URL  = "https://api.zeptomail.eu/v1.1/email"
    OLLAMA_ENABLED     = "true"
    OLLAMA_URL         = "http://192.168.1.148:11434"
    OLLAMA_MODEL       = "llama3.1:8b"
    OLLAMA_TIMEOUT_MS  = "12000"
    BOT_MIN_DELAY_MS   = "900"
    BOT_DIFFICULTY     = "auto"
  }
  foreach ($key in $managedDefaults.Keys) {
    if ($deploymentOwned -contains $key -or -not $values.Contains($key)) {
      $values[$key] = $managedDefaults[$key]
    }
  }

  # Anything else in the remote .env (ZEPTOMAIL_TOKEN, SMTP credentials, ...)
  # is preserved untouched.
  $envContents = ($values.Keys | ForEach-Object { "$_=$($values[$_])" }) -join "`n"
  Set-Content -LiteralPath $envFile -Value ($envContents + "`n") -NoNewline -Encoding ascii
  & scp -q $envFile "${Remote}:$RemoteRoot/.env"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not upload the deployment environment file."
  }

  if ($ConfigFile) {
    Write-Host "Uploading app config from $ConfigFile..." -ForegroundColor Cyan
    & scp -q $ConfigFile "${Remote}:$RemoteRoot/config/app.json"
    if ($LASTEXITCODE -ne 0) {
      throw "Could not upload the app config."
    }
  }

  Write-Host "Building and starting the container on $Remote..." -ForegroundColor Cyan
  & ssh $Remote "bash '$RemoteRoot/remote-deploy.sh'"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote deployment failed. See the output above for container logs."
  }

  if (-not $SkipHealthCheck) {
    Write-Host "Checking $PublicUrl/api/health ..." -ForegroundColor Cyan
    $healthy = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      try {
        $response = Invoke-RestMethod -Uri "$PublicUrl/api/health" -TimeoutSec 4
        if ($response.ok -eq $true) {
          $healthy = $true
          break
        }
      } catch {
        # The container may still be starting; retry.
      }
      Start-Sleep -Seconds 2
    }
    if (-not $healthy) {
      throw "The container is running, but $PublicUrl/api/health did not respond. Check 'ssh $Remote docker compose -f $RemoteRoot/docker-compose.yml logs hive'."
    }
  }

  Write-Host ""
  Write-Host "Hive Online deployed successfully." -ForegroundColor Green
  Write-Host "  URL:      $PublicUrl"
  Write-Host "  Source:   ${Remote}:$RemoteRoot/site"
  Write-Host "  Data:     ${Remote}:$RemoteRoot/data"
  Write-Host "  Config:   ${Remote}:$RemoteRoot/config/app.json"
  Write-Host "  Logs:     ssh $Remote 'docker compose -f $RemoteRoot/docker-compose.yml logs -f hive'"
  Write-Host "  Verify:   ssh $Remote 'docker compose -f $RemoteRoot/docker-compose.yml exec hive node dist/server/verify-user.js --list'"
}
finally {
  if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $envFile) {
    Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
  }
}
