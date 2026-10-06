# Remove merged worktrees safely: unlink the node_modules junction first (rmdir on a junction unlinks only),
# then delete the tree, counting D:\mad-app\node_modules before and after each one.
$names = 'd281-rules','f281-perl','g281-guards','d281-gates','f281-scale','f281-key','f281-deps','f281-cat','f281-comp'
$count = { (Get-ChildItem D:\mad-app\node_modules -Directory -Force | Measure-Object).Count }
$before = & $count
"main node_modules before: $before"
foreach ($n in $names) {
  $p = "D:\worktrees\$n"
  if (-not (Test-Path $p)) { "$n : missing"; continue }
  $nm = Get-Item "$p\node_modules" -Force -ErrorAction SilentlyContinue
  if ($nm -and ($nm.Attributes -match 'ReparsePoint')) { cmd /c rmdir "$p\node_modules" | Out-Null }
  $left = @(Get-ChildItem -Path $p -Force -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -match 'ReparsePoint' }).Count
  if ($left -ne 0) { "$n : links left $left, NOT deleted"; continue }
  cmd /c rmdir /s /q "$p" | Out-Null
  $now = & $count
  "$n : deleted=$(-not (Test-Path $p)) main node_modules=$now"
  if ($now -ne $before) { "STOP: main node_modules changed"; break }
}
