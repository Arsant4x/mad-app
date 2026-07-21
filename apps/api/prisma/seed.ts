import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const devUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
  const devPassword = process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;
  if (!devPassword) {
    throw new Error('DEV_SEED_PLATFORM_ADMIN_PASSWORD must be set in .env before seeding');
  }

  const devTemplate = await prisma.permissionTemplate.upsert({
    where: { id: 'dev-template' },
    update: {},
    create: { id: 'dev-template', name: 'المطوّر', isSystem: true, isAllScreens: true },
  });

  const fullAccessTemplate = await prisma.permissionTemplate.upsert({
    where: { id: 'full-access-template' },
    update: {},
    create: { id: 'full-access-template', name: 'المستخدم الأول (شامل)', isSystem: false, isAllScreens: true },
  });

  await prisma.loginIdentity.upsert({
    where: { username: devUsername },
    update: {},
    create: {
      username: devUsername,
      passwordHash: await argon2.hash(devPassword),
      actorType: 'PLATFORM_ADMIN',
      platformAdmin: { create: { displayName: 'المطوّر' } },
    },
  });

  // Two demo companies — used both for manual testing and by the
  // tenant-isolation Jest suite to prove that company A can never see
  // company B's accounts.
  const companyA = await seedDemoCompany({
    username: 'demo-company-a',
    password: 'DemoPass123!',
    orgName: 'شركة الأفق التجارية (تجريبي)',
    templateId: fullAccessTemplate.id,
  });

  const companyB = await seedDemoCompany({
    username: 'demo-company-b',
    password: 'DemoPass123!',
    orgName: 'مؤسسة النخيل العقارية (تجريبي)',
    templateId: fullAccessTemplate.id,
  });

  // Everything below is seeded via upsert (not inside seedDemoCompany's
  // create-once block) so re-running the seed against an already-seeded DB
  // still adds anything new — e.g. the ledger accounts below were added
  // after the demo companies already existed in dev databases.

  // The baseline chart of accounts auto-posting needs (see
  // apps/api/src/journal/auto-posting.util.ts): A/R, A/P, VAT payable,
  // sales revenue, rental revenue, and the purchase-category expense
  // accounts. Without these, invoices/purchases/rent payments still save
  // fine but silently skip posting to the ledger (see postInvoiceEntry/
  // postPurchaseEntry/postRentPaymentEntry's soft-skip).
  const LEDGER_ACCOUNTS = [
    { code: '1200', name: 'الذمم المدينة', type: 'asset', openingBalance: 0 },
    { code: '2100', name: 'الذمم الدائنة', type: 'liability', openingBalance: 0 },
    { code: '2200', name: 'ضريبة القيمة المضافة المستحقة', type: 'liability', openingBalance: 0 },
    { code: '4100', name: 'إيرادات المبيعات', type: 'revenue', openingBalance: 0 },
    { code: '4200', name: 'إيرادات الإيجار', type: 'revenue', openingBalance: 0 },
    { code: '5100', name: 'تكلفة المبيعات', type: 'expense', openingBalance: 0 },
    { code: '5200', name: 'الرواتب والأجور', type: 'expense', openingBalance: 0 },
    { code: '5300', name: 'مصروفات إدارية وعمومية', type: 'expense', openingBalance: 0 },
    { code: '5400', name: 'مصروفات أخرى', type: 'expense', openingBalance: 0 },
    { code: '5500', name: 'مصروفات تأسيس', type: 'expense', openingBalance: 0 },
  ];
  await seedAccounts(companyA.id, [
    { code: '1000', name: 'النقدية', type: 'asset', openingBalance: 50000 },
    { code: '2000', name: 'الموردون', type: 'liability', openingBalance: 12000 },
    ...LEDGER_ACCOUNTS,
  ]);
  await seedAccounts(companyB.id, [{ code: '1000', name: 'الصندوق', type: 'asset', openingBalance: 8000 }, ...LEDGER_ACCOUNTS]);

  await seedCustomers(companyA.id, [
    { name: 'شركة أفق العقارية', vatNumber: '300012345600003', phone: '0555000111' },
    { name: 'مؤسسة البناء الحديث', vatNumber: '300099988800003', phone: '0555000222' },
  ]);
  await seedCustomers(companyB.id, [{ name: 'عبدالله الحربي', vatNumber: '', phone: '0555000333' }]);

  await seedSuppliers(companyA.id, [
    { name: 'المورد التقني المتحد', vatNumber: '301099988800003', phone: '0555111222', category: 'خدمات تقنية' },
  ]);
  await seedSuppliers(companyB.id, [{ name: 'مؤسسة الصيانة العامة', vatNumber: '', phone: '0555333444', category: 'صيانة' }]);

  console.log(`Seeded. Platform admin username: ${devUsername} / dev template: ${devTemplate.name}`);
}

async function seedDemoCompany(opts: {
  username: string;
  password: string;
  orgName: string;
  templateId: string;
}) {
  const existing = await prisma.loginIdentity.findUnique({ where: { username: opts.username }, include: { company: true } });
  if (existing?.company) return existing.company;

  const identity = await prisma.loginIdentity.create({
    data: {
      username: opts.username,
      passwordHash: await argon2.hash(opts.password),
      actorType: 'COMPANY',
      company: {
        create: {
          orgName: opts.orgName,
          permissionTemplateId: opts.templateId,
          status: 'ACTIVE',
        },
      },
    },
    include: { company: true },
  });

  return identity.company!;
}

/** Same RLS-transaction requirement as seedCustomers/seedSuppliers below.
 * Upserts by `companyId_code` so re-running against an already-seeded DB
 * adds any new accounts (e.g. LEDGER_ACCOUNTS) without touching existing
 * ones — an account's `balance` may have drifted from postings since, so
 * only `openingBalance` would ever need updating here, and code/type/name
 * for an existing account are left untouched on upsert. */
async function seedAccounts(companyId: string, accounts: { code: string; name: string; type: string; openingBalance: number }[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    for (const a of accounts) {
      await tx.account.upsert({
        where: { companyId_code: { companyId, code: a.code } },
        update: {},
        create: { companyId, code: a.code, name: a.name, type: a.type, openingBalance: a.openingBalance, balance: a.openingBalance },
      });
    }
  });
}

/**
 * `customers` has Row-Level Security enabled (see the invoices migration),
 * and this script connects as `app_user` (non-superuser, so RLS actually
 * applies — see prisma/schema.prisma's datasource comment). Every write here
 * must therefore run inside a transaction that first sets
 * `app.company_id`, exactly like TenantPrismaService.runInTenantContext does
 * for real requests — otherwise Postgres silently rejects the insert.
 */
async function seedCustomers(companyId: string, customers: { name: string; vatNumber?: string; phone?: string }[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    for (const c of customers) {
      await tx.customer.upsert({
        where: { companyId_name: { companyId, name: c.name } },
        update: {},
        create: { companyId, name: c.name, vatNumber: c.vatNumber || null, phone: c.phone || null },
      });
    }
  });
}

async function seedSuppliers(companyId: string, suppliers: { name: string; vatNumber?: string; phone?: string; category?: string }[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    for (const s of suppliers) {
      await tx.supplier.upsert({
        where: { companyId_name: { companyId, name: s.name } },
        update: {},
        create: { companyId, name: s.name, vatNumber: s.vatNumber || null, phone: s.phone || null, category: s.category || null },
      });
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
