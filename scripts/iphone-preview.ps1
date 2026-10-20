param([ValidateSet('setup', 'api', 'expo')][string]$Service = 'setup')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$configPath = Join-Path $projectRoot 'artifacts/iphone-preview.json'
if ($Service -eq 'setup') {
  $lanAddress = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
  if (!$lanAddress) { throw 'No local Wi-Fi/LAN address found' }
  $previewKey = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
  New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'artifacts') | Out-Null
  @{ hostAddress = $lanAddress; token = $previewKey } | ConvertTo-Json | Set-Content -LiteralPath $configPath
  $envPath = Join-Path $projectRoot 'apps/mobile/.env.local'
  $previousLines = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath | Where-Object { $_ -notmatch '^EXPO_PUBLIC_(API_URL|PREVIEW_TOKEN)=' } } else { @() }
  @($previousLines; "EXPO_PUBLIC_API_URL=http://${lanAddress}:3001"; "EXPO_PUBLIC_PREVIEW_TOKEN=$previewKey") | Set-Content -LiteralPath $envPath
  Write-Output "iPhone Expo Go URL: exp://${lanAddress}:8081"
  exit
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($Service -eq 'api') {
  $env:RS_PREVIEW_HOST = $config.hostAddress
  $env:RS_PREVIEW_TOKEN = $config.token
  npm run demo -w '@biz/api'
} else {
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $config.hostAddress
  npm run start -w '@biz/mobile' -- --go --lan --port 8081
}
