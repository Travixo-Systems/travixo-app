# load/smoke.ps1
#
# Smoke run against production. Reads only.
#
# Usage, from the project root, in PowerShell:
#
#   .\load\smoke.ps1
#
# Reads SUPABASE_URL and the anon key from .env.local so no key is typed by
# hand or left in shell history. Requires k6 on PATH:  winget install k6
#
# ENABLE_WRITES is not set, so the write scenarios return immediately. Nothing
# in this run mutates data.

$ErrorActionPreference = 'Stop'

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
  Write-Host "k6 is not installed. Run:  winget install k6" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path '.env.local')) {
  Write-Host "Run this from the project root (.env.local not found)." -ForegroundColor Red
  exit 1
}

# Pull the two Supabase values out of .env.local.
$envMap = @{}
Get-Content '.env.local' | ForEach-Object {
  if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
    $envMap[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
  }
}

$supabaseUrl = $envMap['NEXT_PUBLIC_SUPABASE_URL']
$anonKey     = $envMap['NEXT_PUBLIC_SUPABASE_ANON_KEY']

if (-not $supabaseUrl -or -not $anonKey) {
  Write-Host "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local" -ForegroundColor Red
  exit 1
}

$profileName = if ($args[0]) { $args[0] } else { 'smoke' }

Write-Host ""
Write-Host "Profile      : $profileName"
Write-Host "Target       : https://app.travixosystems.com  (PRODUCTION)"
Write-Host "Writes       : disabled"
Write-Host ""

k6 run `
  -e BASE_URL="https://app.travixosystems.com" `
  -e ALLOW_PROD_HOST=true `
  -e SUPABASE_URL="$supabaseUrl" `
  -e SUPABASE_ANON_KEY="$anonKey" `
  -e AUTH_COOKIE_NAME="travixo-auth" `
  -e TEST_USERS="user2@eurorent-equipment.test:TestPassword123!" `
  -e SCAN_QR_CODE="qr-24035006" `
  -e PROFILE="$profileName" `
  load/scenarios/journey.js
