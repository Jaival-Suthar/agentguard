$ErrorActionPreference = "Stop"

$repoPath = Join-Path $PSScriptRoot "..\.runtime\trueforge"

if (-not (Test-Path $repoPath)) {
    throw "TrueForge runtime not found. Run scripts/setup-trueforge-docker.ps1 first."
}

Push-Location $repoPath
docker compose up --build
Pop-Location
