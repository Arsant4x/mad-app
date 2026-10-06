# نقطةُ استعادةٍ قبل تنظيف البرامج (تُشغَّل مرفوعةً بموافقة صاحب المشروع على طلب UAC).
$log = 'D:\mad-app-scratch\review-282r\restore-point.log'
"start $(Get-Date -Format o)" | Out-File $log -Encoding utf8
try {
  Checkpoint-Computer -Description 'before-app-cleanup-282' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop -WarningVariable w
  if ($w) { "warning: $w" | Out-File $log -Append -Encoding utf8 }
  'checkpoint: ok' | Out-File $log -Append -Encoding utf8
} catch {
  "checkpoint error: $($_.Exception.Message)" | Out-File $log -Append -Encoding utf8
}
Get-ComputerRestorePoint | Select-Object -Last 3 SequenceNumber, CreationTime, Description | Format-Table -AutoSize | Out-String | Out-File $log -Append -Encoding utf8
"end $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8
