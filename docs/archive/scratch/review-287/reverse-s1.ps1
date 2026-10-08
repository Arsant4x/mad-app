$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-otp'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287otp$1'
$cases = @(
  @('b1','apps/api/src/verification/otp-challenges.service.ts','e2e'),
  @('b2','apps/api/src/verification/otp-challenges.service.ts','e2e'),
  @('b3','apps/api/src/verification/otp-challenges.service.ts','e2e'),
  @('b4','apps/api/src/verification/otp-challenges.service.ts','e2e'),
  @('b5','apps/api/src/verification/otp-challenges.service.ts','e2e'),
  @('b6','apps/api/src/verification/verification-gateway.service.ts','unit'),
  @('b7','apps/api/src/verification/providers.ts','unit'),
  @('b8','apps/api/src/common/config/production-secrets.ts','unit')
)
foreach ($c in $cases) {
  $id = $c[0]; $rel = $c[1]; $kind = $c[2]
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $rel "$b\$id.find" "$b\$id.repl" 2>&1
  if ($kind -eq 'e2e') { $out = npx.cmd jest --rootDir . --testRegex "otp-challenges.e2e-spec.ts$" --runInBand 2>&1 | Out-String }
  else { $out = npx.cmd jest src/verification/providers.spec.ts 2>&1 | Out-String }
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  $failed = ([regex]::Matches($out, '● [^\r\n]+') | ForEach-Object { $_.Value } | Select-Object -Unique) -join ' | '
  git -C $wt checkout -- $rel
  $clean = (git -C $wt status --porcelain -- $rel)
  "$id [$landed] $tests :: $failed :: restored=$([string]::IsNullOrEmpty($clean))"
}
