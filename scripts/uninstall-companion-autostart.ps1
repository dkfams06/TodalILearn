$ErrorActionPreference = 'Stop'

$startupDirectory = [Environment]::GetFolderPath('Startup')
$launcherPath = Join-Path $startupDirectory 'FamilyWorshipSermonAI-Companion.cmd'

if (Test-Path -LiteralPath $launcherPath) {
  Remove-Item -LiteralPath $launcherPath -Force
  Write-Output "Companion autostart removed: $launcherPath"
} else {
  Write-Output 'Companion autostart is not installed.'
}
