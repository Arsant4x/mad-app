$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-core'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s3'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287core$1'
$pub = 'apps/api/src/forms/form-public.service.ts'
$sig = 'apps/api/src/forms/form-signing.service.ts'
$ins = 'apps/api/src/forms/form-instances.service.ts'
$ctl = 'apps/api/src/forms/form-public.controller.ts'
$cases = @(
  @{ id = 'session-not-matched'; f = $pub; br = 'e1'; t = 'test/form-signing.e2e' },
  @{ id = 'detail-before-login'; f = $pub; br = 'e2'; t = 'test/form-signing.e2e' },
  @{ id = 'token-stored-plain'; f = $sig; br = 'e3'; t = 'test/form-signing.e2e' },
  @{ id = 'otp-despite-nafath'; f = $pub; br = 'e4'; t = 'test/form-signing.e2e' },
  @{ id = 'full-mobile-stored'; f = $pub; br = 'e5'; t = 'test/form-signing.e2e' },
  @{ id = 'sent-editable-in-app'; f = $ins; br = 'e6'; t = 'test/form-signing.e2e' },
  @{ id = 'expired-link-open'; f = $pub; br = 'e7'; t = 'test/form-signing.e2e' },
  @{ id = 'otp-throttle-widened'; f = $ctl; br = 'e8'; t = 'test/form-public-throttle' },
  @{ id = 'revision-restarts-period'; f = $sig; br = 'e9'; t = 'test/form-signing.e2e' }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  $out = npx.cmd jest --rootDir . --testRegex "e2e-spec.ts$" --runInBand $c.t 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/api/src)
  "$($c.id) [$landed] $tests :: restored=$([string]::IsNullOrEmpty($clean))"
}
