$Localnet = Split-Path $PSScriptRoot -Parent
$pidFile = Join-Path $Localnet ".validator.pid"
if (Test-Path $pidFile) {
  $id = Get-Content $pidFile
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Write-Host "Validator stopped"
