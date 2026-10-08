$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-settings'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s2'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287set$1'
$svc = 'apps/api/src/forms/form-signing-settings.service.ts'
$ctl = 'apps/api/src/forms/form-signing-settings.controller.ts'
$cases = @(
  @{ id = 'service-layer-only-removed'; breaks = @(,@('c2', $svc)) },
  @{ id = 'guard-layer-only-removed'; breaks = @(,@('c5', $ctl)) },
  @{ id = 'both-layers-removed'; breaks = @(@('c2', $svc), @('c5', $ctl)) },
  @{ id = 'unknown-type-allowed'; breaks = @(,@('c3', $svc)) },
  @{ id = 'default-eight'; breaks = @(,@('c4', $svc)) }
)
foreach ($c in $cases) {
  $landed = @()
  foreach ($br in $c.breaks) { $landed += (node D:\mad-app-scratch\review-287\break.mjs $wt $br[1] "$b\$($br[0]).find" "$b\$($br[0]).repl" 2>&1) }
  $out = npx.cmd jest --rootDir . --testRegex "form-signing-settings.e2e-spec.ts$" --runInBand 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  foreach ($br in $c.breaks) { git -C $wt checkout -- $br[1] }
  $clean = (git -C $wt status --porcelain -- apps/api/src/forms)
  "$($c.id) [$($landed -join ' ; ')] $tests :: restored=$([string]::IsNullOrEmpty($clean))"
}
