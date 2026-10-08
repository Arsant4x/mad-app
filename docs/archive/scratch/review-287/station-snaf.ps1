$ErrorActionPreference = 'Continue'
Set-Location 'D:\worktrees\d287-snaf\apps\api'
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287snaf$1'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$out = npx.cmd jest --testPathIgnorePatterns=e2e-spec --maxWorkers=2 2>&1 | Out-String
$out | Set-Content D:\mad-app-scratch\review-287\station-snaf.txt -Encoding utf8
([regex]::Matches($out, '(FAIL [^\r\n]+|Test Suites:[^\r\n]+|Tests:[^\r\n]+)')).Value | Select-Object -Unique
