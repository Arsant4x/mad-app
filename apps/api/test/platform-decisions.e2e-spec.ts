import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (`ق-١٢٨٥`) — ثلاثةُ أضعاف المقيس، وجُلُّه في `beforeAll` (تركيبٌ + تهشيرتا `argon2`).
jest.setTimeout(150000);

/**
 * **الفعلُ الحرجُ على المنصّة بيدين لا بيد** (`ق-١٣١٨` · ⑪A1 — باب `⑪ تشغيلُ المنصّة`).
 *
 * «**محوُ بيانات منشأةٍ أو تغييرُ اشتراكها بيدٍ واحدة يقع مرّةً ولا يُردّ**»
 * (`docs/domain-scan/11` · A1).
 *
 * **والمصفوفةُ تُقاس بالطرفين**: الفعلُ يُردّ بلا قرار، **ويُردّ بقرارٍ أقرّه طالبُه**،
 * ويمضي بقرارٍ أقرّه غيرُه — **ثم لا يمضي ثانيةً بالقرار نفسِه**.
 */
describe('القراراتُ المنصّية الحرجة (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}`.slice(-9);
  const PASSWORD = 'DecidePass123!';
  const tokens: Record<'a' | 'b', string> = { a: '', b: '' };
  const createdIdentityIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (who: 'a' | 'b') => `Bearer ${tokens[who]}`;

  async function makeAdmin(key: 'a' | 'b'): Promise<void> {
    const username = `dec-${key}-${suffix}`;
    const identity = await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash(PASSWORD), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    createdIdentityIds.push(identity.id);
    await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: `مقرّر ${key}`, role: PlatformRole.OWNER } });
    const login = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    tokens[key] = login.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await makeAdmin('a');
    await makeAdmin('b');
  });

  afterAll(async () => {
    await prisma.platformDecision.deleteMany({ where: { summary: { contains: suffix } } });
    for (const id of createdIdentityIds) await prisma.loginIdentity.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const ask = (who: 'a' | 'b', action: string, targetId: string, values: { subEnd?: string } = {}) =>
    http().post('/admin/decisions').set('Authorization', as(who)).send({ action, targetId, summary: `ملخّصُ الأثر للاختبار ${suffix}`, ...values });

  describe('تعديلُ الاشتراك', () => {
    let target: IsolatedCompany;
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    beforeAll(async () => {
      target = await registerIsolatedCompany(app, 'decisions');
    });

    afterAll(async () => {
      await removeIsolatedCompany(app, target);
    });

    it('🔴 ① لا يمضي بلا قرار — والرفضُ يقول ما ينقص', async () => {
      const res = await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).send({ subEnd: nextYear }).expect(409);
      expect(String(res.body.message)).toContain('تعديل اشتراك');
    });

    it('🔴 ② ولا يُقرّه طالبُه — بيدين لا بيد', async () => {
      const asked = await ask('a', 'SUBSCRIPTION_CHANGE', target.companyId, { subEnd: nextYear }).expect(201);
      const res = await http().post(`/admin/decisions/${asked.body.id}/approve`).set('Authorization', as('a')).expect(409);
      expect(String(res.body.message)).toContain('بيدين');
      // ولا يمضي الفعلُ ما دام معلّقاً.
      await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).send({ subEnd: nextYear }).expect(409);
    });

    it('⭐ ③ ويمضي بقرارٍ أقرّه غيرُه — مرّةً واحدة', async () => {
      const pending = await prisma.platformDecision.findFirstOrThrow({ where: { targetId: target.companyId, status: 'PENDING' }, select: { id: true } });
      await http().post(`/admin/decisions/${pending.id}/approve`).set('Authorization', as('b')).expect(201);

      await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).send({ subEnd: nextYear }).expect(200);

      // 🔴 **والقرارُ يُصرف مرّةً**: المحاولةُ الثانية تُردّ، فلا يُمدَّد الاشتراكُ بإقرارٍ واحدٍ مرّتين.
      const again = await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).send({ subEnd: nextYear }).expect(409);
      expect(String(again.body.message)).toContain('تعديل اشتراك');
      const consumed = await prisma.platformDecision.findUniqueOrThrow({ where: { id: pending.id }, select: { status: true, executedAt: true } });
      expect(consumed.status).toBe('EXECUTED');
      expect(consumed.executedAt).not.toBeNull();
    });

    it('④ والمرفوضُ لا يُصرف', async () => {
      const asked = await ask('a', 'SUBSCRIPTION_CHANGE', target.companyId, { subEnd: nextYear }).expect(201);
      await http().post(`/admin/decisions/${asked.body.id}/reject`).set('Authorization', as('b')).send({ note: 'لا مبرّر' }).expect(201);
      await http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).send({ subEnd: nextYear }).expect(409);
    });
  });

  it('🔴 ⑤ واليدُ الواحدة ممنوعةٌ في القاعدة كذلك — لا في الخدمة وحدَها', async () => {
    const asked = await ask('a', 'REFUND', `probe-${suffix}`).expect(201);
    const admin = await prisma.platformDecision.findUniqueOrThrow({ where: { id: asked.body.id }, select: { requestedById: true } });
    // تحديثٌ خامٌّ لا يمرّ بالخدمة — وهو المسارُ الذي لا يراه حارسٌ في الشيفرة.
    await expect(
      prisma.$executeRawUnsafe(`UPDATE platform_decisions SET "decidedById" = '${admin.requestedById}', status = 'APPROVED' WHERE id = '${asked.body.id}'`),
    ).rejects.toThrow(/platform_decisions_two_hands/);
  });

  it('⑥ وملخّصُ الأثر إلزاميّ — فالمُقرُّ يوافق على ما يقرأ', async () => {
    await http().post('/admin/decisions').set('Authorization', as('a')).send({ action: 'REFUND', targetId: `x-${suffix}`, summary: 'قصير' }).expect(400);
  });
});
