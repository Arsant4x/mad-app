$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-parties'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s5'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287parties$1'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$sig = 'apps/api/src/forms/form-signing.service.ts'
$ins = 'apps/api/src/forms/form-instances.service.ts'
$cases = @(
  @{ id = 'paper-on-sealed'; f = $sig; br = 'b4'; unit = $false },
  @{ id = 'authority-out-of-seal'; f = $ins; br = 'b8'; unit = $true }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  if ($c.unit) {
    $out = npx.cmd jest src/forms/seal-signature.spec.ts 2>&1 | Out-String
  } else {
    $out = npx.cmd jest --rootDir . --testRegex "e2e-spec.ts$" --runInBand test/form-signing-parties 2>&1 | Out-String
  }
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  $err = ([regex]::Match($out, 'error TS\d+[^\r\n]*')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/api/src)
  "$($c.id) [$landed] $tests $err :: restored=$([string]::IsNullOrEmpty($clean))"
}
