/**
 * Times the income statement, balance sheet, cash flow and dashboard reports over a one year
 * and a ten year range, through the real ReportsService and its tenant transaction (the default
 * 5 s interactive transaction timeout), for the companies with the most journal lines.
 *
 * Read only: the connection is opened with default_transaction_read_only, so nothing this
 * script does can write to the database it measures.
 *
 * Run from apps/api:
 *   DATABASE_URL=... npx ts-node scripts/benchmark-report-ranges.ts [--top=3] [--runs=3]
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { ReportsService } from '../src/reports/reports.service';
import { DASHBOARD_CARDS } from '../src/reports/dashboard-cards';

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

function readOnlyUrl(url: string): string {
  const option = 'options=-c%20default_transaction_read_only%3Don';
  return url.includes('?') ? `${url}&${option}` : `${url}?${option}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  process.env.DATABASE_URL = readOnlyUrl(url);
  const prisma = new PrismaService();
  await prisma.$connect();
  const tenant = new TenantPrismaService(prisma);
  const reports = new ReportsService(tenant);

  const readOnly = await prisma.$queryRawUnsafe<{ transaction_read_only: string }[]>('SHOW transaction_read_only');
  if (readOnly[0]?.transaction_read_only !== 'on') throw new Error('connection is not read only, refusing to measure');

  const companies = await prisma.company.findMany({ select: { id: true } });
  const sized: { id: string; lines: number; first: Date | null; last: Date | null }[] = [];
  for (const c of companies) {
    const row = await tenant.runInTenantContext(c.id, (tx) =>
      tx.$queryRawUnsafe<{ lines: bigint; first: Date | null; last: Date | null }[]>(
        'SELECT count(*) AS lines, min(e."date") AS first, max(e."date") AS last FROM journal_lines l JOIN journal_entries e ON e.id = l."journalEntryId"',
      ),
      { timeout: 600_000, maxWait: 60_000 },
    );
    process.stdout.write('.');
    sized.push({ id: c.id, lines: Number(row[0].lines), first: row[0].first, last: row[0].last });
  }
  sized.sort((a, b) => b.lines - a.lines);
  const total = sized.reduce((s, c) => s + c.lines, 0);
  console.log(`companies ${sized.length} · journal lines ${total}`);

  const top = sized.slice(0, arg('top', 3));
  const runs = arg('runs', 3);
  const to = new Date().toISOString().slice(0, 10);
  const fromYears = (n: number) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - n);
    return d.toISOString().slice(0, 10);
  };
  const ranges = [
    { label: '1y', range: { from: fromYears(1), to } },
    { label: '10y', range: { from: fromYears(10), to } },
    { label: 'open', range: {} },
    // A range with no lines in it isolates the fixed cost of each report from the per line cost.
    { label: 'empty', range: { from: '1900-01-01', to: '1900-01-02' } },
  ];
  const cards = new Set(DASHBOARD_CARDS);
  const calls: { name: string; run: (companyId: string, range: { from?: string; to?: string }) => Promise<unknown> }[] = [
    { name: 'income-statement', run: (id, r) => reports.incomeStatement(id, 'all', r) },
    { name: 'balance-sheet', run: (id, r) => reports.balanceSheet(id, 'all', r) },
    { name: 'cash-flow', run: (id, r) => reports.cashFlow(id, 'all', r) },
    { name: 'dashboard', run: (id, r) => reports.dashboard(id, 'all', r, cards) },
  ];

  for (const c of top) {
    console.log(`\ncompany ${c.id} · lines ${c.lines} · ${c.first?.toISOString().slice(0, 10)} .. ${c.last?.toISOString().slice(0, 10)}`);
    for (const { label, range } of ranges) {
      const inRange = await tenant.runInTenantContext(c.id, (tx) =>
        tx.journalLine.count({ where: { journalEntry: { date: { ...(range.from ? { gte: new Date(range.from) } : {}), ...(range.to ? { lte: new Date(range.to) } : {}) } } } }),
      );
      console.log(`  lines in ${label.padEnd(5)} ${inRange}`);
    }
    for (const call of calls) {
      for (const { label, range } of ranges) {
        const times: number[] = [];
        let error = '';
        for (let i = 0; i < runs; i++) {
          const t0 = process.hrtime.bigint();
          try {
            await call.run(c.id, range);
          } catch (e) {
            error = (e as Error).message.split('\n')[0];
          }
          times.push(Number(process.hrtime.bigint() - t0) / 1e6);
        }
        const sorted = [...times].sort((a, b) => a - b);
        console.log(`  ${call.name.padEnd(17)} ${label.padEnd(5)} median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms · max ${sorted[sorted.length - 1].toFixed(0)} ms${error ? ` · ERROR ${error}` : ''}`);
      }
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
