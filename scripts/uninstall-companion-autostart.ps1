$ErrorActionPreference = 'Stop'

$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDirectory 'FamilyWorshipSermonAI-Companion.cmd'

if (Test-Path -LiteralPath $launcherPath) {
  Remove-Item -LiteralPath $launcherPath -Force
  Write-Output "Companion 자동 시작을 해제했습니다: $launcherPath"
} else {
  Write-Output '등록된 Companion 자동 시작 파일이 없습니다.'
}
