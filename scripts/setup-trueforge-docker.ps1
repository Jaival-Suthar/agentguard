$ErrorActionPreference = "Stop"

$runtimeRoot = Join-Path $PSScriptRoot "..\.runtime"
$repoPath = Join-Path $runtimeRoot "trueforge"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (-not (Test-Path $repoPath)) {
    Write-Host "Cloning official TrueForge repository into .runtime..." -ForegroundColor Cyan

    git clone https://github.com/truefoundry/trueforge.git $repoPath
}
else {
    Write-Host "TrueForge already exists. Pulling latest main..." -ForegroundColor Cyan

    Push-Location $repoPath
    try {
        git checkout main
        git pull --ff-only
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Prepare upstream TrueForge environment
# ---------------------------------------------------------------------------

$envExample = Join-Path $repoPath "packages\trueforge\.env.example"
$envFile = Join-Path $repoPath "packages\trueforge\.env"

if ((Test-Path $envExample) -and (-not (Test-Path $envFile))) {
    Copy-Item $envExample $envFile

    Write-Host "Created upstream packages\trueforge\.env from example." -ForegroundColor Green
    Write-Host "Review that file before starting hosted mode." -ForegroundColor Yellow
}
elseif (-not (Test-Path $envFile)) {
    throw "TrueForge environment file not found: $envFile"
}

# ---------------------------------------------------------------------------
# Apply AgentGuard Docker integration
#
# Upstream hosted Compose exposes:
#   host :8791 -> container :8790
#
# The TrueForge server must listen on 0.0.0.0 inside the container so the
# published host port can reach it.
# ---------------------------------------------------------------------------

$composePath = Join-Path $repoPath "docker-compose.yml"

if (-not (Test-Path $composePath)) {
    throw "TrueForge docker-compose.yml not found: $composePath"
}

$compose = Get-Content -Path $composePath -Raw

if ($compose -match '(?m)^\s+HOST:\s+0\.0\.0\.0\s*$') {
    Write-Host "TrueForge Docker host binding already configured." -ForegroundColor Cyan
}
else {
    $pattern = '(?m)^(\s+NODE_ENV:\s+production\s*\r?\n)'

    if ($compose -notmatch $pattern) {
        throw "Could not locate server NODE_ENV configuration in docker-compose.yml"
    }

    $updatedCompose = [regex]::Replace(
        $compose,
        $pattern,
        '$1      HOST: 0.0.0.0' 
    )

    Set-Content -Path $composePath -Value $updatedCompose -NoNewline

    Write-Host "Applied AgentGuard Docker host binding: HOST=0.0.0.0" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Final status
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Runtime prepared at: $repoPath" -ForegroundColor Green
Write-Host "TrueForge host URL: http://localhost:8791" -ForegroundColor Green
Write-Host "TrueForge container port: 8790" -ForegroundColor Green
Write-Host "This folder is ignored by AgentGuard Git." -ForegroundColor Green