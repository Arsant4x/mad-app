import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { isConvergentConflict } from '../src/common/retry-on-conflict.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (82.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(250000);

/**
 * **مصادقةُ الفيصل على خطأٍ حقيقيٍّ من القاعدة** (`ق-١١٩٨`/④ · `ق-٢٦٢`).
 *
 * الفيصلُ في `retryOnUniqueConflict` كان مكتوباً أوّلاً على `meta.target` مصفوفةَ أعمدة —
 * **وقياسُه هنا أسقطه**: بدور التطبيق (`app_user`) يصل `P2002` بـ`target: null` ورسالةِ
 * «Unique constraint failed on the (not available)» — فكان الفيصلُ سيُطفئ الإعادةَ كلَّها بصمت،
 * وتعود سباقاتُ الترقيم تسقط `500`. فصار الفيصلُ يقرأ النموذجَ حين يغيب الهدف — وهذا الملفُّ
 * يقرأ الشكلَ كما يصل كلَّ تشغيل، فإن غيّره Prisma يوماً سقط هنا لا في الإعادة.
 */
describe('شكلُ P2002 كما يبلّغه Prisma — مصادقةُ فيصل الإعادة (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'p2002-shape');
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  async function duplicate(create: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<Prisma.PrismaClientKnownRequestError> {
    try {
      await tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
        await create(tx);
        await create(tx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // الشكلُ كما وصل — يُطبع كي يُقرأ حين يتغيّر، لا يُفترض.
        // eslint-disable-next-line no-console
        console.log(`[P2002] code=${e.code} meta=${JSON.stringify(e.meta)}`);
        return e;
      }
      throw e;
    }
    throw new Error('لم يقع P2002 — المسبارُ لا يستفزّ القيد');
  }

  it('قيدٌ ليس رقماً (`accounts (companyId, code)`): النموذجُ `Account` والهدفُ غائب — ولا يُعاد', async () => {
    const e = await duplicate((tx) => tx.account.create({ data: { companyId: company.companyId, code: '9999', name: 'مكرَّر', type: 'asset' } as Prisma.AccountUncheckedCreateInput }));
    expect(e.code).toBe('P2002');
    expect(e.meta?.modelName).toBe('Account');
    // الحالُ المقيس: لا أعمدةَ تصل. فإن صارت تصل يوماً فالفيصلُ يقرؤها أوّلاً — والتوكيدُ التالي يبقى صادقاً.
    expect(e.meta?.target ?? null).toBeNull();
    expect(isConvergentConflict(e)).toBe(false);
  });

  it('قيدُ الرقم (`journal_entries (companyId, no)`): النموذجُ `JournalEntry` — ويُعاد', async () => {
    const e = await duplicate((tx) =>
      tx.journalEntry.create({
        data: {
          companyId: company.companyId,
          no: 'JE-DUP-0001',
          date: new Date('2026-01-01'),
          memo: 'مكرَّر',
          totalDebit: 0,
          totalCredit: 0,
          baseTotalDebit: 0,
          baseTotalCredit: 0,
        } as Prisma.JournalEntryUncheckedCreateInput,
      }),
    );
    expect(e.code).toBe('P2002');
    expect(e.meta?.modelName).toBe('JournalEntry');
    expect(isConvergentConflict(e)).toBe(true);
  });
});
