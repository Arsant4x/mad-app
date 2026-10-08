$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-sweep'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s4'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287sweep$1'
$sw = 'apps/api/src/forms/form-signing-sweep.service.ts'
$sig = 'apps/api/src/forms/form-signing.service.ts'
$cases = @(
  @{ id = 'mid-reminder-repeats'; f = $sw; br = 'f1' },
  @{ id = 'awaiting-never-expires'; f = $sw; br = 'f2' },
  @{ id = 'objected-gets-reminders'; f = $sw; br = 'f3' },
  @{ id = 'revision-sent-after-dispute'; f = $sig; br = 'f4' }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  $out = npx.cmd jest --rootDir . --testRegex "e2e-spec.ts$" --runInBand test/form-signing-sweep 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/api/src)
  "$($c.id) [$landed] $tests :: restored=$([string]::IsNullOrEmpty($clean))"
}
