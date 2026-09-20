import pg from 'pg';
const cid = process.argv[2] ?? 'c10000';
const POOL = Number(process.argv[3] ?? 9); // Prisma default on 4 vCPU = 2*4+1
const pool = new pg.Pool({ host: 'localhost', port: 5433, user: 'app_user', password: 'x', database: 'mad_app', max: POOL, connectionTimeoutMillis: 2000 /* Prisma maxWait default */ });

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await c.query("SELECT set_config('app.company_id',$1,true)", [cid]); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
  finally { c.release(); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, concurrency, body) {
  const t0 = performance.now(); let ok = 0, fail = 0; const lat = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    const t = performance.now();
    try { await tx(body); ok++; } catch (e) { fail++; }
    lat.push(performance.now() - t);
  }));
  lat.sort((a, b) => a - b);
  const p = (q) => Math.round(lat[Math.floor(lat.length * q)]);
  console.log(`${label.padEnd(52)} ok=${String(ok).padStart(3)} fail=${String(fail).padStart(3)} total=${Math.round(performance.now() - t0)}ms p50=${p(0.5)}ms p95=${p(0.95)}ms`);
}

console.log(`\n== ${cid} pool=${POOL} (maxWait 2000ms like Prisma default)`);
// ① every request = interactive tx that holds a connection for the request duration (guard 3 tx + service 1 tx ≈ 4 sequential short tx; here 1 tx of ~invoices.list cost)
for (const n of [5, 10, 20, 50]) {
  await run(`GET /invoices-like list, ${n} concurrent`, n, async (c) => {
    await c.query('SELECT * FROM invoices ORDER BY "issueDate" DESC');
    await c.query('SELECT * FROM invoice_lines WHERE "invoiceId" IN (SELECT id FROM invoices)');
  });
}
// ② hot-row serialization: every sale updates the same 3 account rows and then does ~60ms of other work (stock, outbox, dims) inside the same tx
const [{ id: a1 }, { id: a2 }, { id: a3 }] = await tx(async (c) => (await c.query("SELECT id FROM accounts ORDER BY code LIMIT 3")).rows);
for (const n of [1, 5, 10, 20]) {
  await run(`POS sale-like: 3 hot account rows + 60ms work, ${n} concurrent`, n, async (c) => {
    for (const id of [a1, a2, a3]) await c.query('UPDATE accounts SET balance = balance + 1 WHERE id=$1', [id]);
    await sleep(60);
  });
}
// ③ same work without touching the hot rows (what a ledger-only design would cost)
for (const n of [10, 20]) {
  await run(`POS sale-like: no hot rows + 60ms work, ${n} concurrent`, n, async () => { await sleep(60); });
}
await pool.end();
