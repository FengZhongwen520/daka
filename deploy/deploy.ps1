$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$gitBash = Join-Path $env:ProgramFiles "Git\bin\bash.exe"

if (-not (Test-Path -LiteralPath $gitBash)) {
  throw "Git Bash was not found at $gitBash"
}

Push-Location $repoRoot
try {
  & $gitBash "deploy/deploy.sh" "--env" "test" @args
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
