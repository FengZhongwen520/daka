$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $serviceRoot '.env.local'

$needsNewSecrets = -not (Test-Path -LiteralPath $envFile)
if (-not $needsNewSecrets) {
  $existing = Get-Content -LiteralPath $envFile -Raw
  $needsNewSecrets = $existing -notmatch '(?m)^DAKA_ENCRYPTION_KEY=.+$' -or
    $existing -notmatch '(?m)^DAKA_LOOKUP_PEPPER=.+$'
}

if ($needsNewSecrets) {
  $encryptionBytes = New-Object byte[] 32
  $lookupBytes = New-Object byte[] 32
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($encryptionBytes)
    $random.GetBytes($lookupBytes)
  } finally {
    $random.Dispose()
  }
  $lines = @(
    "DAKA_ENCRYPTION_KEY=$([Convert]::ToBase64String($encryptionBytes))"
    "DAKA_LOOKUP_PEPPER=$([Convert]::ToBase64String($lookupBytes))"
    'DAKA_SERVER_PORT=8080'
    'DAKA_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173'
  )
  Set-Content -LiteralPath $envFile -Value ($lines -join [Environment]::NewLine) -NoNewline
  Write-Host "Created local secrets in $envFile. Back up this file; changing it makes existing cloud data unreadable."
}

Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

Push-Location $serviceRoot
try {
  mvn spring-boot:run
} finally {
  Pop-Location
}
