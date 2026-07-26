$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDirectory 'FamilyWorshipSermonAI-Companion.cmd'
$dataDirectory = Join-Path $projectRoot 'data'
$errorLogPath = Join-Path $dataDirectory 'companion-error.log'

if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "Companion autostart is not installed. Run: npm run companion:install-autostart"
}

$launcher = Get-Content -LiteralPath $launcherPath -Raw
if (-not $launcher.Contains($projectRoot) -or -not $launcher.Contains('run companion')) {
  throw "The autostart launcher does not point to this project. Reinstall it: $launcherPath"
}

if (-not (Test-Path -LiteralPath $dataDirectory -PathType Container)) {
  throw "The log directory is missing. Reinstall autostart: $dataDirectory"
}

$client = [System.Net.Sockets.TcpClient]::new()
$running = $false
try {
  $connect = $client.ConnectAsync('127.0.0.1', 47631)
  try {
    $running = $connect.Wait(1500) -and $client.Connected
  } catch {
    $running = $false
  }
} finally {
  $client.Dispose()
}

Write-Output "Autostart registration: OK"
Write-Output "Launcher: $launcherPath"
if ($running) {
  Write-Output "Companion process: RUNNING"
} else {
  Write-Output "Companion process: NOT RUNNING (restart Windows or run: npm run companion)"
  if (Test-Path -LiteralPath $errorLogPath -PathType Leaf) {
    Write-Output "Error log: $errorLogPath"
  }
}
