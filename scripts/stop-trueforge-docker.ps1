$ErrorActionPreference = "Stop"

$repoPath = Join-Path $PSScriptRoot "..\.runtime\trueforge"

if (-not (Test-Path $repoPath)) {
    throw "TrueForge runtime not found."
}

Push-Location $repoPath
docker compose down
Pop-Location
