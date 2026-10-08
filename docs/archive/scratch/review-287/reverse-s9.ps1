$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-paper'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s9'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287paper$1'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$sig = 'apps/api/src/forms/form-signing.service.ts'
$cases = @(
  @{ id = 'paper-role-stays-counterparty'; f = $sig; br = 'p1' },
  @{ id = 'paper-authority-not-found-accepted'; f = $sig; br = 'p2' },
  @{ id = 'paper-authority-for-natural-person'; f = $sig; br = 'p3' },
  @{ id = 'paper-final-copy-skips-designated-mobile'; f = $sig; br = 'p4' },
  @{ id = 'paper-authority-document-not-in-seal'; f = $sig; br = 'p5' }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  $out = npx.cmd jest --rootDir . --testRegex "e2e-spec.ts$" --runInBand test/form-signing-parties 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  $err = ([regex]::Match($out, 'error TS\d+[^\r\n]*')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/api/src)
  "$($c.id) [$landed] $tests $err :: restored=$([string]::IsNullOrEmpty($clean))"
}
