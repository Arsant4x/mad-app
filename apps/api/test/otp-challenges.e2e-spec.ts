import { HttpException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OtpChallengesService } from '../src/verification/otp-challenges.service';
import { OTP_POLICY } from '../src/verification/otp-policy';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس — 25.4 s على قاعدةٍ من الصفر (توجيه ٢٨٧).
jest.setTimeout(76000);

/**
 * ⚖️ **تحدّي رمز التحقّق على القاعدة** (توجيه ٢٨٧ ② و⑪ و⑫ · `ق-١٥٩١` · `ق-١٦٣٥` ④). كلُّ حدٍّ أمنيٍّ حالةٌ جوابُها معروفٌ يداً، ويُثبت بكسرٍ
 * متعمَّد يُسقطها ثم يُعاد:
 *
 * ① الرمزُ لا يُخزَّن نصّاً ولا الجوالُ كاملاً · ② الصحيحُ يُقبل مرّةً ثم «مستعمَل» · ③ ثلاثُ محاولاتٍ خاطئة تقفله ولو جاء الصحيحُ بعدها ·
 * ④ بعد خمس دقائق «منقضٍ» · ⑤ الجديدُ يُبطل القديم · ⑥ ستّةُ إصداراتٍ للموضوع ثم `429` · ⑦ الغرضُ والموضوعُ لا يتبادلان ·
 * ⑧ منشأةٌ أخرى لا ترى التحدّي (العزلُ في القاعدة).
 */
describe('OTP challenges — hashed, single use, three attempts, five minutes, five resends (e2e)', () => {
  let app: INestApplication;
  let tenant: TenantPrismaService;
  let prisma: PrismaService;
  const otp = new OtpChallengesService();
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  const phone = { mobileE164: '+966555123442', mobileMasked: '0555 ••• 442' };

  const issue = (company: IsolatedCompany, subjectKey: string, now?: Date) =>
    tenant.runInTenantContext(company.companyId, (tx) => otp.issueWithinTx(tx, { companyId: company.companyId, purpose: 'FORM_SIGNER_LOGIN', subjectKey, ...phone, now }));
  const verify = (company: IsolatedCompany, id: string, subjectKey: string, code: string, now?: Date, purpose: 'FORM_SIGNER_LOGIN' | 'FORM_SUBSTITUTE_PHONE' = 'FORM_SIGNER_LOGIN') =>
    tenant.runInTenantContext(company.companyId, (tx) => otp.verifyWithinTx(tx, { companyId: company.companyId, id, purpose, subjectKey, code, now }));
  const wrong = (code: string) => String((Number(code) + 1) % 10 ** OTP_POLICY.digits).padStart(OTP_POLICY.digits, '0');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tenant = app.get(TenantPrismaService);
    prisma = app.get(PrismaService);
    a = await registerIsolatedCompany(app, 'otp-a');
    b = await registerIsolatedCompany(app, 'otp-b');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    await app.close();
  });

  it('① الرمزُ بصمةٌ لا نصّ، والجوالُ بصمةٌ ومقنَّعٌ — قراءةٌ مباشرة من القاعدة', async () => {
    const { id, code } = await issue(a, 'form:one');
    expect(code).toMatch(/^\d{6}$/);
    const row = await tenant.runInTenantContext(a.companyId, (tx) => tx.verificationChallenge.findUniqueOrThrow({ where: { id } }));
    const stored = JSON.stringify(row);
    expect(row.codeHash.startsWith('b1:')).toBe(true);
    expect(stored).not.toContain(code);
    expect(stored).not.toContain('555123442');
    expect(row.mobileMasked).toBe('0555 ••• 442');
    expect(row.maxAttempts).toBe(3);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(OTP_POLICY.ttlMs - 5000);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(OTP_POLICY.ttlMs + 5000);
  });

  it('② الصحيحُ يُقبل مرّةً واحدة، والثانيةُ «مستعمَل»', async () => {
    const { id, code } = await issue(a, 'form:two');
    expect(await verify(a, id, 'form:two', code)).toEqual({ result: 'OK', attemptsLeft: 3 });
    expect((await verify(a, id, 'form:two', code)).result).toBe('USED');
  });

  it('③ ثلاثُ محاولاتٍ خاطئة تقفله — والصحيحُ بعدها مرفوض، والمحاولاتُ محفوظةٌ لا تُرجَع', async () => {
    const { id, code } = await issue(a, 'form:three');
    expect(await verify(a, id, 'form:three', wrong(code))).toEqual({ result: 'WRONG', attemptsLeft: 2 });
    expect(await verify(a, id, 'form:three', wrong(code))).toEqual({ result: 'WRONG', attemptsLeft: 1 });
    expect(await verify(a, id, 'form:three', wrong(code))).toEqual({ result: 'LOCKED', attemptsLeft: 0 });
    expect((await verify(a, id, 'form:three', code)).result).toBe('LOCKED');
    const row = await tenant.runInTenantContext(a.companyId, (tx) => tx.verificationChallenge.findUniqueOrThrow({ where: { id } }));
    expect(row.attempts).toBe(3);
    expect(row.lockedAt).not.toBeNull();
    expect(row.consumedAt).toBeNull();
  });

  it('④ بعد خمس دقائق «منقضٍ» ولو كان الرمزُ صحيحاً', async () => {
    const { id, code } = await issue(a, 'form:four');
    const later = new Date(Date.now() + OTP_POLICY.ttlMs + 1000);
    expect((await verify(a, id, 'form:four', code, later)).result).toBe('EXPIRED');
  });

  it('⑤ الإصدارُ الجديد يُبطل القديم', async () => {
    const first = await issue(a, 'form:five');
    const second = await issue(a, 'form:five');
    expect((await verify(a, first.id, 'form:five', first.code)).result).toBe('USED');
    expect((await verify(a, second.id, 'form:five', second.code)).result).toBe('OK');
  });

  it('⑥ ستّةُ إصداراتٍ للموضوع (الأوّلُ وخمسُ إعادات) ثم 429 — والعدُّ لا يُصفَّر بالاستعمال', async () => {
    const left: number[] = [];
    for (let i = 0; i < OTP_POLICY.maxIssuesPerSubject; i++) left.push((await issue(a, 'form:six')).issuesLeft);
    expect(left).toEqual([5, 4, 3, 2, 1, 0]);
    const refused = await issue(a, 'form:six').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(429);
    // وموضوعٌ آخر لا يتأثّر.
    expect((await issue(a, 'form:six-other')).issuesLeft).toBe(5);
  });

  it('⑦ رمزُ موضوعٍ أو غرضٍ لا يصلح لغيره', async () => {
    const { id, code } = await issue(a, 'form:seven');
    expect((await verify(a, id, 'form:other', code)).result).toBe('NOT_FOUND');
    expect((await verify(a, id, 'form:seven', code, undefined, 'FORM_SUBSTITUTE_PHONE')).result).toBe('NOT_FOUND');
    expect((await verify(a, id, 'form:seven', code)).result).toBe('OK');
  });

  it('⑧ منشأةٌ أخرى لا ترى التحدّي — والقاعدةُ ترفض كتابتَه باسم غيرها', async () => {
    const { id, code } = await issue(a, 'form:eight');
    expect((await verify(b, id, 'form:eight', code)).result).toBe('NOT_FOUND');
    const seen = await tenant.runInTenantContext(b.companyId, (tx) => tx.verificationChallenge.count({ where: { id } }));
    expect(seen).toBe(0);
    // بلا سياقٍ لا يُرى شيء (المسبارُ يرى: بالسياق يُرى الصفّ).
    const blind = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "verification_challenges" WHERE "id" = ${id}`;
    expect(Number(blind[0].n)).toBe(0);
    const withContext = await tenant.runInTenantContext(a.companyId, (tx) => tx.verificationChallenge.count({ where: { id } }));
    expect(withContext).toBe(1);
    // وكتابةُ تحدٍّ باسم «أ» من سياق «ب» يردّها شرطُ الكتابة في السياسة — بجملةٍ خام، لأن امتدادَ النطاق في التطبيق يكتب منشأةَ السياق
    // فوق ما يُمرَّر فلا يبلغ القاعدةَ الطلبُ العابر أصلاً (الطبقةُ الأولى)؛ والمقصودُ هنا الثانية.
    const crossWrite = await tenant
      .runInTenantContext(b.companyId, (tx) =>
        tx.$executeRaw`INSERT INTO "verification_challenges" ("id","companyId","purpose","subjectKey","mobileIndex","mobileMasked","codeHash","maxAttempts","expiresAt")
                       VALUES (${`${id}-x`}, ${a.companyId}, 'FORM_SIGNER_LOGIN', 'form:eight', 'b1:x', 'x', 'b1:x', 3, now())`,
      )
      .catch((e: unknown) => e);
    expect(String((crossWrite as Error)?.message ?? crossWrite)).toContain('row-level security');
    expect((await verify(a, id, 'form:eight', code)).result).toBe('OK');
  });
});
