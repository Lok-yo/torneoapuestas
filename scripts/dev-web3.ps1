# Arranca Anvil (chain 80002) y despliega MarketFactory + mocks.
$ErrorActionPreference = 'Stop'
$foundry = Join-Path $env:USERPROFILE '.foundry\bin'
$env:PATH = "$foundry;$env:PATH"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command anvil -ErrorAction SilentlyContinue)) {
  Write-Error "No se encontro anvil. Instala Foundry en $foundry"
}

Write-Host "Anvil en http://127.0.0.1:8545 (chain 80002). Deja esta ventana abierta."
Write-Host "En otra terminal: npm run deploy:local"
anvil --chain-id 80002 --host 127.0.0.1 --port 8545 --block-time 1
