$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDirectory 'FamilyWorshipSermonAI-Companion.cmd'
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$dataDirectory = Join-Path $projectRoot 'data'
$logPath = Join-Path $projectRoot 'data\companion.log'
$errorLogPath = Join-Path $projectRoot 'data\companion-error.log'

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

$lines = @(
  '@echo off',
  "cd /d `"$projectRoot`"",
  "`"$npmCommand`" run companion >> `"$logPath`" 2>> `"$errorLogPath`""
)

[System.IO.File]::WriteAllLines(
  $launcherPath,
  $lines,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Companion 자동 시작을 등록했습니다: $launcherPath"
Write-Output "정상 로그: $logPath"
Write-Output "오류 로그: $errorLogPath"
