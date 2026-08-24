$ErrorActionPreference = "Stop"

$runtimeRoot = Join-Path $PSScriptRoot "..\.runtime"
$repoPath = Join-Path $runtimeRoot "trueforge"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (-not (Test-Path $repoPath)) {
    Write-Host "Cloning official TrueForge repository into .runtime..." -ForegroundColor Cyan
    git clone https://github.com/truefoundry/trueforge.git $repoPath
} else {
    Write-Host "TrueForge already exists. Pulling latest main..." -ForegroundColor Cyan
    Push-Location $repoPath
    git checkout main
    git pull
    Pop-Location
}

$envExample = Join-Path $repoPath "packages\trueforge\.env.example"
$envFile = Join-Path $repoPath "packages\trueforge\.env"

if ((Test-Path $envExample) -and (-not (Test-Path $envFile))) {
    Copy-Item $envExample $envFile
    Write-Host "Created upstream packages\trueforge\.env from example." -ForegroundColor Green
    Write-Host "Review that file before starting hosted mode." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Runtime prepared at: $repoPath" -ForegroundColor Green
Write-Host "This folder is ignored by AgentGuard Git." -ForegroundColor Green
