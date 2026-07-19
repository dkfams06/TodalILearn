$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDirectory 'FamilyWorshipSermonAI-Companion.cmd'
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$logPath = Join-Path $projectRoot 'data\companion.log'
$errorLogPath = Join-Path $projectRoot 'data\companion-error.log'

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
