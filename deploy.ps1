[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$gitBash = Join-Path $env:ProgramFiles "Git\bin\bash.exe"
$deployScript = Join-Path $repoRoot "deploy\deploy.sh"
$configPath = Join-Path $repoRoot "deploy\baota.env"
$configExample = Join-Path $repoRoot "deploy\baota.env.example"

if (-not (Test-Path -LiteralPath $gitBash)) {
  throw "Git Bash was not found at $gitBash"
}

if (-not (Test-Path -LiteralPath $deployScript)) {
  throw "Deployment script was not found at $deployScript"
}

if ($Help) {
  & $gitBash "deploy/deploy.sh" "--env" "test" "--help"
  exit $LASTEXITCODE
}

if (-not (Test-Path -LiteralPath $configPath)) {
  if (-not (Test-Path -LiteralPath $configExample)) {
    throw "Deployment config template was not found at $configExample"
  }

  Copy-Item -LiteralPath $configExample -Destination $configPath
  Write-Host "Created $configPath from the project template."
}

Push-Location $repoRoot
try {
  $arguments = @("deploy/deploy.sh", "--env", "test")
  if ($DryRun) {
    $arguments += "--dry-run"
  }

  & $gitBash @arguments
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
