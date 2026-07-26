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

Write-Output "Companion autostart installed: $launcherPath"
Write-Output "Output log: $logPath"
Write-Output "Error log: $errorLogPath"
