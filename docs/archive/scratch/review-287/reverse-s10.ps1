$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-snaf'
$api = "$wt\apps\api"
$b = 'D:\mad-app-scratch\review-287\breaks-s10'
$env:PATH = "C:\Program Files\Git\usr\bin;" + $env:PATH
Set-Location $api
Get-Content .env.test | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k, $v.Trim('"')) }
$env:DATABASE_URL = $env:DATABASE_URL -replace '/[^/?]+(\?|$)', '/mad_app_d287snaf$1'
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
$pub = 'apps/api/src/forms/form-public.service.ts'
$sig = 'apps/api/src/forms/form-signing.service.ts'
$cases = @(
  @{ id = 'nafath-start-without-otp'; f = $pub; br = 'b1'; spec = 'test/form-signing-substitute' },
  @{ id = 'otp-session-alone-sees-and-signs'; f = $pub; br = 'b2'; spec = 'test/form-signing-substitute' },
  @{ id = 'substitute-without-national-id'; f = $sig; br = 'b3'; spec = 'test/form-signing-substitute' },
  @{ id = 'final-copy-to-representative-link'; f = $pub; br = 'b4'; spec = 'test/form-signing-parties' },
  @{ id = 'paper-signer-inferred-from-empty-fields'; f = $sig; br = 'b5'; spec = 'test/form-signing-parties' },
  @{ id = 'paper-final-copy-to-representative'; f = $sig; br = 'b6'; spec = 'test/form-signing-parties' },
  @{ id = 'nafath-poll-without-otp'; f = $pub; br = 'b7'; spec = 'test/form-signing-substitute' }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  $out = npx.cmd jest --rootDir . --testRegex "e2e-spec.ts$" --runInBand $c.spec 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests:\s+[^\r\n]+')).Value
  $err = ([regex]::Match($out, 'error TS\d+[^\r\n]*')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/api/src)
  "$($c.id) [$landed] $tests $err :: restored=$([string]::IsNullOrEmpty($clean))"
}
