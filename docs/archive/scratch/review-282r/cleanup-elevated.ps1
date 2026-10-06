# تنظيفُ الجهاز (مرفوعاً بموافقة صاحب المشروع على UAC): نقطةُ استعادة أوّلاً، ولا حذفَ إن لم تثبت.
$log = 'D:\mad-app-scratch\review-282r\cleanup-elevated.log'
function L($m) { "$(Get-Date -Format o) $m" | Out-File $log -Append -Encoding utf8 }
"" | Out-File $log -Encoding utf8
L 'start'
$name = 'before-app-cleanup-282'
$t0 = Get-Date
try {
  Checkpoint-Computer -Description $name -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop -WarningVariable w
  if ($w) { L "checkpoint warning: $w" }
} catch { L "checkpoint error: $($_.Exception.Message)" }
$rp = Get-ComputerRestorePoint | Where-Object { $_.Description -eq $name } | Sort-Object SequenceNumber | Select-Object -Last 1
if (-not $rp) { L 'ABORT: no restore point with that name; nothing removed'; exit 1 }
$created = [Management.ManagementDateTimeConverter]::ToDateTime($rp.CreationTime)
L "restore point: seq=$($rp.SequenceNumber) description=$($rp.Description) created=$($created.ToString('o'))"
if ($created -lt $t0.AddMinutes(-5)) { L 'ABORT: restore point is older than this run; nothing removed'; exit 1 }

# البرامجُ الثلاثة من (ج) بأمر صاحب المشروع. لا تعريفَ ولا غيرَها.
Get-Process | Where-Object { $_.Path -match '\\TecnoAI\\|\\Kingsoft\\WPS Office\\|\\Microsoft\\Copilot\\' } | ForEach-Object { L "stop $($_.ProcessName) $($_.Id)"; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
function Run($label, $file, $argList) {
  if (-not (Test-Path $file)) { L "${label}: uninstaller missing ($file)"; return }
  $p = Start-Process -FilePath $file -ArgumentList $argList -PassThru
  if (-not $p.WaitForExit(900000)) { L "${label}: still running after 15 min (left running)"; return }
  L "${label}: exit=$($p.ExitCode)"
}
Run 'TecnoAI' 'C:\TecnoAI\unins000.exe' '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART'
Run 'WPS Office' 'C:\Program Files (x86)\Kingsoft\WPS Office\12.2.0.21931\utility\uninst.exe' '/s'
Run 'Copilot' 'C:\Program Files (x86)\Microsoft\Copilot\Application\154.0.4258.53\Installer\copilot_setup.exe' '--uninstall --mscopilot --channel=stable --system-level --force-uninstall'
L 'end'
