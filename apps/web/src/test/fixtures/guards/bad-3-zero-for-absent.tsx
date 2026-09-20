// كسرٌ مقصود للقاعدة ③ — الغائبُ يصير صفراً فيبدو الجدولُ مكتملاً.
export function fmtBad(n: number | string | undefined): string {
  const num = Number(n);
  return (Number.isFinite(num) ? num : 0).toFixed(2);
}

export function BadZeroForAbsent({ amount, rows }: { amount: string | null; rows?: { n: number }[] }) {
  const shown = amount ?? 0;
  const count = rows?.length ?? 0;
  return (
    <div>
      {fmtBad(shown as string)} {count}
    </div>
  );
}
