$ErrorActionPreference = "Stop"
$env:PATH = "SOLANA_BIN_PLACEHOLDER;" + $env:PATH
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
# scripts -> localnet -> tests -> repo? 
# PSScriptRoot = tests/localnet/scripts
$Localnet = Split-Path $PSScriptRoot -Parent
$Fixtures = Join-Path $Localnet "fixtures"
# Use TEMP ledger — avoids ACL issues under some Windows workspaces
$Ledger = Join-Path $env:TEMP "batchit-localnet-ledger"

# Kill existing validator on 8899 if any
Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

if (Test-Path $Ledger) {
  try { Remove-Item -Recurse -Force $Ledger } catch {
    Write-Host "Warning: could not wipe ledger fully: $_"
  }
}

$Pump = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
$Fees = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
$Mpl = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
$Mayhem = "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e"
$Global = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
$FeeConfig = "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt"
$Gva = "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y"

Write-Host "Starting solana-test-validator with REAL pump + fee + metaplex dumps..."
$args = @(
  "--reset",
  "--ledger", $Ledger,
  "--bind-address", "127.0.0.1",
  "--rpc-port", "8899",
  "--quiet",
  "--bpf-program", $Pump, (Join-Path $Fixtures "pump.so"),
  "--bpf-program", $Fees, (Join-Path $Fixtures "pump_fees.so"),
  "--bpf-program", $Mpl, (Join-Path $Fixtures "mpl_token_metadata.so"),
  "--bpf-program", $Mayhem, (Join-Path $Fixtures "mayhem.so"),
  "--account", $Global, (Join-Path $Fixtures "global.json"),
  "--account", $FeeConfig, (Join-Path $Fixtures "fee_config.json"),
  "--account", $Gva, (Join-Path $Fixtures "global_volume_accumulator.json")
)

$logOut = Join-Path $Localnet "validator.out.log"
$logErr = Join-Path $Localnet "validator.err.log"
$proc = Start-Process -FilePath "solana-test-validator" -ArgumentList $args -PassThru `
  -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden
$proc.Id | Out-File (Join-Path $Localnet ".validator.pid")
Write-Host "Validator PID $($proc.Id), logs $logOut / $logErr"

# Wait for RPC
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8899" -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' -UseBasicParsing -TimeoutSec 2
    if ($r.Content -match "ok") { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ok) { throw "Validator failed to become healthy. See $logOut / $logErr" }
Write-Host "Validator healthy on http://127.0.0.1:8899"
