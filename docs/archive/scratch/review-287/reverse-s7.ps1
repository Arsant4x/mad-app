$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-subst'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s7'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287subst$1'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$pub = 'apps/api/src/forms/form-public.service.ts'
$sig = 'apps/api/src/forms/form-signing.service.ts'
$cases = @(
  @{ id = 'decision-without-session'; f = $pub; br = 's1' },
  @{ id = 'decision-on-sign-link'; f = $pub; br = 's2' },
  @{ id = 'tenant-link-stays-open'; f = $pub; br = 's3' },
  @{ id = 'final-copy-to-substitute'; f = $pub; br = 's4' },
  @{ id = 'consent-by-nafath'; f = $pub; br = 's5' },
  @{ id = 'substitute-is-tenant'; f = $sig; br = 's6' }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  $out = npx.cmd jest --rootDir . --testRegex "e2e-spec.ts$" --runInBand test/form-signing-substitute 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  $err = ([regex]::Match($out, 'error TS\d+[^\r\n]*')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/api/src)
  "$($c.id) [$landed] $tests $err :: restored=$([string]::IsNullOrEmpty($clean))"
}
