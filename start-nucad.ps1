param(
  [switch]$SkipBackend,
  [switch]$SkipFrontend,
  [int]$BackendPort = 4001,
  [int]$FrontendPort = 3002
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

function Test-Port {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $connection
}

function Wait-Port {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 120,
    [string]$Name = "service"
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port -Port $Port) {
      Write-Host "$Name is listening on port $Port."
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "$Name did not start on port $Port within $TimeoutSeconds seconds."
}

function Start-NpmProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Arguments,
    [hashtable]$Environment = @{}
  )

  $stdout = Join-Path $WorkingDirectory "$Name.stdout.log"
  $stderr = Join-Path $WorkingDirectory "$Name.stderr.log"

  $previousEnvironment = @{}
  foreach ($key in $Environment.Keys) {
    $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    if ($null -eq $Environment[$key]) {
      Remove-Item "Env:$key" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$key" ([string]$Environment[$key])
    }
  }

  try {
    $process = Start-Process `
      -FilePath "npm.cmd" `
      -ArgumentList $Arguments `
      -WorkingDirectory $WorkingDirectory `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -WindowStyle Hidden `
      -PassThru
  } finally {
    foreach ($key in $previousEnvironment.Keys) {
      if ($null -eq $previousEnvironment[$key]) {
        Remove-Item "Env:$key" -ErrorAction SilentlyContinue
      } else {
        Set-Item "Env:$key" $previousEnvironment[$key]
      }
    }
  }
  Write-Host "Started $Name, pid $($process.Id)."
  return $process
}

Write-Host "Starting NuCAD from $Root"

if (-not $SkipBackend) {
  if (Test-Port -Port $BackendPort) {
    Write-Host "Backend port $BackendPort is already in use; leaving it as-is."
  } else {
    Start-NpmProcess -Name "backend" -WorkingDirectory $BackendDir -Arguments "start" | Out-Null
    Wait-Port -Port $BackendPort -Name "Backend"
  }
}

if (-not $SkipFrontend) {
  if (Test-Port -Port $FrontendPort) {
    Write-Host "Frontend port $FrontendPort is already in use; leaving it as-is."
  } else {
    Start-NpmProcess `
      -Name "frontend" `
      -WorkingDirectory $FrontendDir `
      -Arguments "start" `
      -Environment @{
        "DANGEROUSLY_DISABLE_HOST_CHECK" = "true";
        "BROWSER" = "none";
        "PORT" = $FrontendPort;
      } | Out-Null
    Wait-Port -Port $FrontendPort -TimeoutSeconds 180 -Name "Frontend"
  }
}

Start-NpmProcess `
  -Name "electron" `
  -WorkingDirectory $FrontendDir `
  -Arguments "run electron-start" `
  -Environment @{
    "ELECTRON_RUN_AS_NODE" = $null;
  } | Out-Null

Write-Host "NuCAD is starting in Electron."
Write-Host "Close the Electron window when you are done. Backend/frontend logs are written next to each package.json."
