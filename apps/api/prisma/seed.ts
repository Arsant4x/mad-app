import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { backfillCompanyOpeningEntries } from '../src/journal/opening-balance.util';
import { DEFAULT_CHART } from '../src/accounts/default-chart';
import { bootstrapPlatform } from '../src/platform/platform-bootstrap';

const prisma = new PrismaClient();

async function main() {
  // حارس: هذه بذرة **تطوير** تُنشئ حسابين دخولهما `DemoPass123!` مكتوبةً في
  // هذا الملف. تشغيلها على خادم حيّ يفتح المنصة للعالم بكلمة مرور منشورة.
  // تمهيد الإنتاج له سكربته: scripts/bootstrap-production.ts.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED_IN_PRODUCTION !== 'true') {
    throw new Error(
      'رُفضت البذرة: هذه بيانات تطوير (حسابات بكلمة مرور منشورة في المستودع) ولن تُزرع في الإنتاج.\n' +
        'لتمهيد منصة حيّة استعمل:  node dist/scripts/bootstrap-production.js',
    );
  }

  const devUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
  const devPassword = process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;
  if (!devPassword) {
    throw new Error('DEV_SEED_PLATFORM_ADMIN_PASSWORD must be set in .env before seeding');
  }

  // نفس التمهيد الذي يشغّله الإنتاج حرفياً — مصدر واحد، فلا يفترق ما يراه
  // المطوّر عمّا يُولد على الخادم.
  await bootstrapPlatform(prisma, { username: devUsername, password: devPassword });

  await reconcileDevAdminPassword(devUsername, devPassword);
  const devTemplate = { id: 'dev-template', name: 'المطوّر' };
  const fullAccessTemplate = { id: 'full-access-template' };

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

  // The chart itself is NOT written here any more: it lives in
  // src/accounts/default-chart.ts, the one source every new company is born
  // with. The seed only adds the demo *opening balances* on top of it — that
  // way a demo company and a freshly-registered merchant get an identical
  // chart, and adding an account for a new posting path is a one-file change.
  //
  // Order matters: the balance-bearing entries go first so the upsert creates
  // them with their amount; DEFAULT_CHART's zero-balance twin then hits the
  // `update: {}` no-op and leaves the amount alone.
  const LEDGER_ACCOUNTS = DEFAULT_CHART.map((a) => ({ ...a, openingBalance: 0 }));
  await seedAccounts(companyA.id, [
    { code: '1000', name: 'النقدية', type: 'asset', openingBalance: 50000 },
    { code: '2000', name: 'الموردون', type: 'liability', openingBalance: 12000 },
    ...LEDGER_ACCOUNTS,
  ]);
  await seedAccounts(companyB.id, [{ code: '1000', name: 'النقدية', type: 'asset', openingBalance: 8000 }, ...LEDGER_ACCOUNTS]);

  // Every seeded opening balance must be backed by a real قيد افتتاحي against
  // 3900 (CLAUDE.md 3.8) — the same idempotent backfill the standalone script
  // runs, so re-seeding an already-migrated DB adds nothing twice.
  await seedOpeningEntries(companyA.id);
  await seedOpeningEntries(companyB.id);

  // Every company gets one activity and its base currency up front, so the
  // rest of the app can assume both exist without null-checking. There's no
  // activity-management screen yet by design — see BusinessActivity's comment.
  await seedActivityAndCurrency(companyA.id, 'النشاط الرئيسي', 'عقارات');
  await seedActivityAndCurrency(companyB.id, 'النشاط الرئيسي', 'عقارات');

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

/**
 * يُصالح كلمة مرور مدير المنصّة مع `.env` — **في بيئة التطوير وحدها**.
 *
 * ## العطل الذي يعالجه
 *
 * `bootstrapPlatform` **لا يُعيد ضبط كلمة مرور حسابٍ قائم**، وحجّته صحيحة
 * ومكتوبة: «إعادة التشغيل بعد التحديث ستُرجع كلمة المرور إلى ما في ملف البيئة
 * وتُبطل أي تدوير جرى بعده». وهي قاعدة **إنتاجٍ لا نقاش فيها**، والدالة
 * مشتركة مع `bootstrap-production.ts` — فلا تُمسّ.
 *
 * لكن أثرها على جهاز التطوير أن الهوية تبقى بكلمة مرورٍ قديمة لا يعرفها أحد،
 * فيسقط الدخول بـ`401`. والمقيس (2026-08-16):
 *
 *     اسم المدير في .env.test: Arsan_admin
 *     كلمة المرور تطابق؟ **false**
 *     platform-admin.e2e-spec.ts ⇒ expected 201, got 401 — 7 failed
 *
 * وأُثبت بشاهدٍ ضابط أنه **بيئيّ لا انحدار**: الحزمة نفسها على شجرةٍ بلا أي
 * تغيير تعطي النتيجة نفسها بالضبط. وهو الوجه الثاني لجذرٍ واحد: **البذرة
 * تُنشئ ولا تُصالح** — وأخفى بين يديه عطلاً وصل `main`.
 *
 * ## ⛔ والشرط جزءٌ من العلاج لا حاشية عليه
 *
 * «إعادة ضبط كلمة مرور قائمة» سلوكٌ **يجب ألّا يبلغ الإنتاج إطلاقاً**: هناك
 * تُولَّد عشوائياً ولا تُوثَّق في أي ملف (قرار المالك). فبلا هذا الشرط **يصير
 * الإصلاح ثغرة**.
 *
 * ⚠️ **والحارس هنا لا في رأس الملف وحده.** أعلى `main()` حارسٌ يمنع البذرة
 * كلها في الإنتاج — وهو يكفي اليوم. لكن حارساً **في موضع الخطر نفسه** يبقى
 * صحيحاً لو نُقلت هذه الدالة أو استُدعيت من مكانٍ آخر. والقاعدة: الحارس يقع
 * حيث الخطر، لا حيث تصادف أن مرّ التنفيذ.
 */
async function reconcileDevAdminPassword(username: string, password: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'reconcileDevAdminPassword استُدعيت في الإنتاج — وهي تُعيد ضبط كلمة مرور قائمة.\n' +
        'كلمة مرور مدير الإنتاج تُولَّد عشوائياً ولا تُشتقّ من ملف بيئة.',
    );
  }

  const identity = await prisma.loginIdentity.findUnique({
    where: { username },
    select: { id: true, passwordHash: true },
  });
  if (!identity) return; // لم يُنشأ بعد — و`bootstrapPlatform` أنشأه بكلمة المرور الصحيحة.

  const matches = await argon2.verify(identity.passwordHash, password).catch(() => false);
  if (matches) return;

  await prisma.loginIdentity.update({ where: { id: identity.id }, data: { passwordHash: await argon2.hash(password) } });
  // يُعلَن صراحةً: تغييرُ اعتمادٍ يجري بصمت أسوأ من عدم إجرائه.
  console.log(`  ↻ كلمة مرور مدير المنصّة (${username}) لم تطابق .env — أُعيد ضبطها [تطوير فقط]`);
}

async function seedDemoCompany(opts: {
  username: string;
  password: string;
  orgName: string;
  templateId: string;
}) {
  const existing = await prisma.loginIdentity.findUnique({ where: { username: opts.username }, include: { company: true } });
  if (existing?.company) return existing.company;

  /**
   * ⚠️ **هويّةٌ بلا منشأة — حالةٌ تقع بين الشرطين، وكانت تُعطّل ٨٠ مجموعة.**
   *
   * الشرط أعلاه على **وجود المنشأة** لا على وجود الهوية. فهويّةٌ يتيمة (حُذفت
   * منشأتها، أو انقطع إنشاءٌ في منتصفه) لا ترجع مبكراً، ثم تسقط في `create`
   * أدناه على تكرار اسم المستخدم. **فالبذرة تفشل كلّها، ولا تُصلح شيئاً.**
   *
   * والأثر ليس نظرياً: `demo-company-a` و`demo-company-b` كانتا يتيمتين على
   * جهاز التطوير، فكانت **كل حزم e2e الداخلة بمنشأة مبذورة** تسقط في
   * `beforeAll` بـ`Cannot read properties of undefined (reading 'companyId')`.
   * أي أن ٨٠ مجموعة تكامل لا تعمل محلياً — **وهو ما أخفى عطلاً وصل `main`**
   * يوم 2026-08-16 (تغيّرت مفاتيح التصدير ولم يكشفه إلا السير).
   *
   * والعلاج **في المصدر لا في الجهاز** (قرار المالك 2026-08-16): تُوصل المنشأة
   * بالهوية القائمة بدل محاولة إنشاء هويةٍ موجودة. **بلا أي حذف.**
   */
  if (existing) {
    const company = await prisma.company.create({
      data: {
        orgName: opts.orgName,
        permissionTemplateId: opts.templateId,
        status: 'ACTIVE',
        // العلاقة أحاديّة الاتجاه في المخطط (`loginIdentityId @unique` بلا حقلٍ
        // مقابل على `LoginIdentity`)، فتُوصَل بالمفتاح لا بـ`connect`.
        loginIdentityId: existing.id,
      },
    });
    console.log(`  ↻ هويةٌ بلا منشأة: ${opts.username} — وُصلت بمنشأة جديدة بدل السقوط`);
    return company;
  }

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
 * for an existing account are left untouched on upsert.
 *
 * `balance` is still seeded equal to `openingBalance` here, deliberately:
 * seedOpeningEntries right after posts the قيد افتتاحي for each account and
 * reverts the account-side double count — one shared invariant («balance
 * already contains the opening amount») for fresh and legacy DBs alike. */
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

/** Posts the قيد افتتاحي behind every seeded opening balance — see
 * backfillCompanyOpeningEntries. Idempotent (accounts that already have an
 * opening entry are skipped), so re-seeding never double-posts. */
async function seedOpeningEntries(companyId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    await backfillCompanyOpeningEntries(tx, companyId);
  });
}

/** Seeds the company's default business activity and its base currency.
 * Same `set_config` requirement as seedAccounts — both tables are RLS-scoped.
 * Idempotent via upsert on the natural keys, so re-running is safe. */
async function seedActivityAndCurrency(companyId: string, activityName: string, activityType: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;

    const existingActivity = await tx.businessActivity.findFirst({ where: { companyId, name: activityName } });
    if (!existingActivity) {
      await tx.businessActivity.create({ data: { companyId, name: activityName, activityType } });
    }

    await tx.currency.upsert({
      where: { companyId_code: { companyId, code: 'SAR' } },
      update: {},
      create: { companyId, code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', isBase: true, rate: 1 },
    });
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
