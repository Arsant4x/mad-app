$ErrorActionPreference = 'Continue'
$wt = 'D:\worktrees\d287-web'
$b = 'D:\mad-app-scratch\review-287\breaks-s6'
Set-Location "$wt\apps\web"
$cases = @(
  @{ id = 'form-read-before-login'; f = 'apps/web/src/pages/PublicFormPage.tsx'; br = 'w1'; t = 'src/pages/PublicFormPage.test.tsx' },
  @{ id = 'sign-without-ack'; f = 'apps/web/src/pages/PublicFormPage.tsx'; br = 'w2'; t = 'src/pages/PublicFormPage.test.tsx' },
  @{ id = 'sent-form-editable'; f = 'apps/web/src/pages/forms/FormRecordPanel.tsx'; br = 'w3'; t = 'src/pages/forms/FormRecordPanel.test.tsx' }
)
foreach ($c in $cases) {
  $landed = node D:\mad-app-scratch\review-287\break.mjs $wt $c.f "$b\$($c.br).find" "$b\$($c.br).repl" 2>&1
  $out = npx.cmd vitest run $c.t 2>&1 | Out-String
  $tests = ([regex]::Match($out, 'Tests\s+[^\r\n]+')).Value
  git -C $wt checkout -- $c.f
  $clean = (git -C $wt status --porcelain -- apps/web/src)
  "$($c.id) [$landed] $tests :: restored=$([string]::IsNullOrEmpty($clean))"
}
