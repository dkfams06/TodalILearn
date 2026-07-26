$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDirectory 'FamilyWorshipSermonAI-Companion.cmd'
$dataDirectory = Join-Path $projectRoot 'data'
$errorLogPath = Join-Path $dataDirectory 'companion-error.log'

if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "자동 시작이 등록되지 않았습니다. npm run companion:install-autostart 를 먼저 실행해 주세요."
}

$launcher = Get-Content -LiteralPath $launcherPath -Raw
if (-not $launcher.Contains($projectRoot) -or -not $launcher.Contains('run companion')) {
  throw "자동 시작 파일이 현재 프로젝트를 가리키지 않습니다. 다시 설치해 주세요: $launcherPath"
}

if (-not (Test-Path -LiteralPath $dataDirectory -PathType Container)) {
  throw "로그 폴더가 없습니다. 자동 시작을 다시 설치해 주세요: $dataDirectory"
}

$client = [System.Net.Sockets.TcpClient]::new()
try {
  $connect = $client.ConnectAsync('127.0.0.1', 47631)
  $running = $connect.Wait(1500) -and $client.Connected
} finally {
  $client.Dispose()
}

Write-Output "자동 시작 등록: 정상"
Write-Output "실행 파일: $launcherPath"
if ($running) {
  Write-Output "Companion 프로세스: 실행 중"
} else {
  Write-Output "Companion 프로세스: 실행되지 않음 (재부팅하거나 npm run companion을 실행하세요.)"
  if (Test-Path -LiteralPath $errorLogPath -PathType Leaf) {
    Write-Output "오류 로그: $errorLogPath"
  }
}
