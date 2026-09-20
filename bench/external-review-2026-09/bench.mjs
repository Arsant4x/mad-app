import pg from 'pg';
const pool = new pg.Pool({ host: 'localhost', port: 5433, user: 'app_user', password: 'x', database: 'mad_app', max: 4 });

async function inTenant(cid, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.company_id', $1, true)", [cid]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } finally { c.release(); }
}
const ms = (t) => Number((performance.now() - t).toFixed(0));
const mb = () => Math.round(process.memoryUsage().heapUsed / 1048576);

const paths = {
  // reports.service.ts:1008 movementsByAccount — all journal lines, aggregated in JS
  'reports.movementsByAccount': async (c) => {
    const { rows } = await c.query('SELECT "accountId", debit, credit FROM journal_lines');
    const map = new Map();
    for (const l of rows) { const cur = map.get(l.accountId) ?? { debit: 0, credit: 0 }; cur.debit += Number(l.debit); cur.credit += Number(l.credit); map.set(l.accountId, cur); }
    return rows.length;
  },
  // same result via SQL aggregation (what it should be)
  'reports.movementsByAccount.SQL': async (c) => {
    const { rows } = await c.query('SELECT "accountId", sum(debit) d, sum(credit) c FROM journal_lines GROUP BY 1');
    return rows.length;
  },
  // stock-quantity.util.ts:17 computeStockQuantities — every movement in memory
  'inventory.computeStockQuantities': async (c) => {
    const { rows } = await c.query('SELECT "productId","warehouseId","toWarehouseId",type,qty FROM stock_movements');
    const q = new Map(); const add = (k, d) => q.set(k, (q.get(k) ?? 0) + d);
    for (const m of rows) { const n = Number(m.qty); if (m.type === 'IN' || m.type === 'ADJUSTMENT') add(m.productId + '|' + m.warehouseId, n); else if (m.type === 'OUT') add(m.productId + '|' + m.warehouseId, -n); else { add(m.productId + '|' + m.warehouseId, -n); if (m.toWarehouseId) add(m.productId + '|' + m.toWarehouseId, n); } }
    return rows.length;
  },
  'inventory.computeStockQuantities.SQL': async (c) => {
    const { rows } = await c.query(`SELECT "productId","warehouseId", sum(CASE WHEN type='OUT' THEN -qty WHEN type='TRANSFER' THEN -qty ELSE qty END) FROM stock_movements GROUP BY 1,2`);
    return rows.length;
  },
  // invoices.service.ts:120 list — all invoices with customer + lines (Prisma does 3 queries), then outstanding map
  'invoices.list': async (c) => {
    const inv = await c.query('SELECT * FROM invoices ORDER BY "issueDate" DESC');
    const ids = inv.rows.map((r) => r.id);
    const lines = await c.query('SELECT * FROM invoice_lines WHERE "invoiceId" = ANY($1)', [ids]);
    const cust = await c.query('SELECT * FROM customers WHERE id = ANY($1)', [[...new Set(inv.rows.map((r) => r.customerId))]]);
    const alloc = await c.query('SELECT "invoiceId", sum(amount) FROM payment_allocations GROUP BY 1');
    return inv.rows.length + lines.rows.length + cust.rows.length + alloc.rows.length;
  },
  // sale-fulfilment.util.ts:129 — per sold product, every movement of that product in the warehouse
  'sale.belowZeroCheck(1 product)': async (c) => {
    const p = (await c.query('SELECT "productId","warehouseId" FROM stock_movements LIMIT 1')).rows[0];
    const { rows } = await c.query('SELECT type, qty FROM stock_movements WHERE "productId"=$1 AND "warehouseId"=$2', [p.productId, p.warehouseId]);
    let q = 0; for (const m of rows) q += m.type === 'OUT' ? -Number(m.qty) : Number(m.qty);
    return rows.length;
  },
  // reports trialBalance (reports.service.ts:721) with date filter over one month — join through journal_entries
  'reports.trialBalance(1 month)': async (c) => {
    const { rows } = await c.query(`SELECT l."accountId", l.debit, l.credit FROM journal_lines l JOIN journal_entries e ON e.id = l."journalEntryId" WHERE e.date >= '2025-03-01' AND e.date <= '2025-03-31'`);
    return rows.length;
  },
  // receivables exposure (receivables-exposure.util.ts:150): all invoices selected + allocations grouped
  'reports.customerExposure': async (c) => {
    const inv = await c.query('SELECT id,no,"docType","relatedInvoiceId","customerId","issueDate","dueDate",total,"baseTotal","exchangeRate",currency FROM invoices WHERE "issueDate" <= now()');
    const alloc = await c.query('SELECT "invoiceId", sum(amount) FROM payment_allocations GROUP BY 1');
    return inv.rows.length + alloc.rows.length;
  },
  // balance-sheet / dashboard style: account balances only (cheap by design)
  'reports.balanceSheet': async (c) => (await c.query('SELECT * FROM accounts ORDER BY code')).rows.length,
};

const sizes = process.argv.slice(2).length ? process.argv.slice(2) : ['c1000', 'c10000', 'c100000'];
for (const cid of sizes) {
  console.log(`\n== ${cid}`);
  for (const [name, fn] of Object.entries(paths)) {
    if (global.gc) global.gc();
    const m0 = mb(); const t = performance.now();
    let n; try { n = await inTenant(cid, fn); } catch (e) { console.log(`${name.padEnd(40)} ERROR ${e.message}`); continue; }
    console.log(`${name.padEnd(40)} ${String(ms(t)).padStart(6)} ms  rows=${String(n).padStart(7)}  heap+${mb() - m0} MB`);
  }
}
await pool.end();
