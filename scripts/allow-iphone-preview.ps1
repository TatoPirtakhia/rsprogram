# Run once in an Administrator PowerShell window for this local preview.
$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator and run this script again.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'artifacts/iphone-preview.json') -Raw | ConvertFrom-Json
$nodePath = (Get-Command node.exe).Source
# Existing Windows popup-denial rules override allow rules. Keep their TCP block
# on all other ports, excluding only the two ports used by this preview.
Get-NetFirewallRule -DisplayName 'Node.js JavaScript Runtime' -ErrorAction SilentlyContinue | Where-Object { $_.Action -eq 'Block' } | ForEach-Object {
  $rule = $_
  $app = $rule | Get-NetFirewallApplicationFilter
  $port = $rule | Get-NetFirewallPortFilter
  $normalizedProgram = $app.Program -replace '\\+', '\'
  if ($normalizedProgram -ieq $nodePath -and $port.Protocol -eq 'TCP' -and $port.LocalPort -eq 'Any') {
    $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort '1-3000','3002-8080','8082-65535'
  }
}
if (!(Get-NetFirewallRule -DisplayName 'BizMonitor iPhone LAN Preview' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'BizMonitor iPhone LAN Preview' -Direction Inbound -Action Allow -Protocol TCP -Program $nodePath -LocalPort 8081,3001 -LocalAddress $config.hostAddress -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Write-Output 'Local iPhone preview access enabled for ports 8081 and 3001.'
