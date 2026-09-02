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

# Find k6.
#
# winget installs it to C:\Program Files\k6 but does not always add that to
# PATH, and an already-open terminal keeps the old PATH even when it does. So
# check PATH first, then the known install locations, rather than telling
# someone to install software they already have.
$k6 = $null
if (Get-Command k6 -ErrorAction SilentlyContinue) {
  $k6 = (Get-Command k6).Source
} else {
  $candidates = @(
    "$env:ProgramFiles\k6\k6.exe",
    "${env:ProgramFiles(x86)}\k6\k6.exe",
    "$env:ProgramData\chocolatey\bin\k6.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $k6 = $c; break }
  }
}

if (-not $k6) {
  Write-Host "k6 not found. Install it with:  winget install k6" -ForegroundColor Red
  Write-Host "If winget says it is already installed, it is not on PATH:" -ForegroundColor Yellow
  Write-Host "  Get-ChildItem 'C:\Program Files\k6' -Filter k6.exe -Recurse" -ForegroundColor Yellow
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

# Which accounts this run may use.
#
# EuroRent is a REAL tenant. It is permitted for the read-only smoke profile
# only, where 5 VUs for 5 minutes is negligible. Every heavier profile drives
# the two load-test organizations instead, so sustained traffic never lands on
# a real customer's data.
$loadTestUsers = "user0@promachinery-france.test:TestPassword123!,user0@techlift-solutions.test:TestPassword123!"
$smokeUser     = "user2@eurorent-equipment.test:TestPassword123!"

if ($profileName -eq 'smoke') {
  $testUsers = $smokeUser
  $userNote  = "EuroRent (read-only smoke only)"
} else {
  $testUsers = $loadTestUsers
  $userNote  = "ZZ-LOADTEST owners (never a real tenant)"
}

Write-Host ""
Write-Host "Profile      : $profileName"
Write-Host "Target       : https://app.travixosystems.com  (PRODUCTION)"
Write-Host "Writes       : disabled"
Write-Host "Accounts     : $userNote"
Write-Host "k6           : $k6"
Write-Host ""

& $k6 run `
  -e BASE_URL="https://app.travixosystems.com" `
  -e ALLOW_PROD_HOST=true `
  -e SUPABASE_URL="$supabaseUrl" `
  -e SUPABASE_ANON_KEY="$anonKey" `
  -e AUTH_COOKIE_NAME="travixo-auth" `
  -e TEST_USERS="$testUsers" `
  -e SCAN_QR_CODE="qr-24035006" `
  -e PROFILE="$profileName" `
  load/scenarios/journey.js
