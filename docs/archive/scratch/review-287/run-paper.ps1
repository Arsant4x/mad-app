$ErrorActionPreference = 'Continue'
$api = 'D:\worktrees\d287-paper\apps\api'
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$env:TEST_CLEAN_DB = 'mad_app_d287paper'
$env:TEST_CLEAN_SHARDS = '1'
node scripts/test-clean.mjs @args 2>&1 | Select-Object -Last 40
