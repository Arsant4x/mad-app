import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (31.6 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(95000);

/**
 * Self-service auth — the SaaS front door:
 *  - a merchant registers itself and walks away with a working, isolated
 *    account that is read only until it subscribes (CLAUDE.md §10);
 *  - a forgotten password is recovered by emailed link — single-use,
 *    short-lived, and silent about which usernames exist.
 *
 * The reset test plants its token straight through Prisma: in tests no real
 * email exists to read the link from, and what the flow must prove lives on
 * the redeem side (hashing, expiry, single-use, session revocation).
 */
describe('Auth self-service: register + password reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanupCompanyIds: string[] = [];

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  async function registerCompany(username: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ orgName: `منشأة تسجيل ${username}`, username, password: 'SelfServe123!', email: `${username}@example.com` })
      .expect(201);
    cleanupCompanyIds.push(res.body.user.companyId);
    return res.body as { accessToken: string; user: { companyId: string } };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);

    adminToken = (
      await request(app.getHttpServer()).post('/auth/login').send({
        username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan',
        password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD,
      })
    ).body.accessToken;
  }, 30000);

  afterAll(async () => {
    // مسارُ المنصّة المباشر حُذف (`ق-٥٤٨`) — التنظيفُ بالمسلك نفسه عبر هويّة الدخول.
    for (const id of cleanupCompanyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('[SPEC 1.7] registers a merchant with an immediate session, no free subscription time, and full isolation', async () => {
    const username = `reg-${suffix}`;
    const { accessToken, user } = await registerCompany(username);

    // The session works right away…
    const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${accessToken}`).expect(200);
    // …and the new tenant starts empty — sees nobody else's data.
    expect(customers.body).toHaveLength(0);

    // No trial: the company has no subscription yet, so it is read only until it subscribes.
    const sub = await request(app.getHttpServer()).get('/subscription').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(sub.body.status).toBe('FROZEN');
    expect(sub.body.neverSubscribed).toBe(true);
    await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${accessToken}`).send({ kind: 'NATURAL', name: `عميل ${username}` }).expect(403);
    expect(user.companyId).toBeTruthy();

    // 🔴 (ق-٦٤٤) **القالبُ الذي يركب عليه التاجرُ ليس نظامياً**: كان التسجيلُ يأخذ
    //    «أوّلَ قالبٍ عامٍّ شامل» بترتيب الإنشاء — وقالبُ المطوّر (`isSystem`) يسبقُ
    //    القالبَ العامَّ بأجزاء ثانية في التأسيس. مقيسٌ: ٢٤٠ من ٥١٤ في التطوير
    //    و٦ من ٦ في المنشور على قالب المطوّر. فوسمٌ «نظاميّ» يُمنح لمن يُنشئ نفسَه
    //    لا يعني شيئاً، وكلُّ فحصٍ يعتمده يصير أعمى.
    const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId! }, select: { permissionTemplate: { select: { id: true, isSystem: true, isAllScreens: true } } } });
    expect(company.permissionTemplate.isSystem).toBe(false);
    expect(company.permissionTemplate.isAllScreens).toBe(true);
  }, 60000);

  it('[SPEC 1.7] refuses a taken username', async () => {
    const username = `reg-dup-${suffix}`;
    await registerCompany(username);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ orgName: 'أخرى', username, password: 'SelfServe123!', email: `${username}-again@example.com` })
      .expect(409);
  }, 60000);

  it('forgot-password answers identically for unknown accounts', async () => {
    const res = await request(app.getHttpServer()).post('/auth/forgot-password').send({ username: `ghost-${suffix}` }).expect(200);
    expect(res.body).toEqual({ ok: true });
  }, 30000);

  it('[SPEC 1.1] resets by token: single-use, kills old password and old sessions', async () => {
    const username = `reset-${suffix}`;
    await registerCompany(username);

    const identity = await prisma.loginIdentity.findUniqueOrThrow({ where: { username } });
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        loginIdentityId: identity.id,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await request(app.getHttpServer()).post('/auth/reset-password').send({ token, newPassword: 'BrandNew123!' }).expect(200);

    // Old password is dead, new one works.
    await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'SelfServe123!' }).expect(401);
    await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'BrandNew123!' }).expect(200);

    // Single-use: the same token never works twice.
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token, newPassword: 'ThirdTry123!' }).expect(401);

    // Every refresh token from before the reset is revoked.
    const live = await prisma.refreshToken.count({ where: { loginIdentityId: identity.id, revokedAt: null, createdAt: { lt: new Date(Date.now() - 1500) } } });
    expect(live).toBe(0);
  }, 60000);

  it('[SPEC 1.1] rejects an expired token outright', async () => {
    const username = `reset-exp-${suffix}`;
    await registerCompany(username);

    const identity = await prisma.loginIdentity.findUniqueOrThrow({ where: { username } });
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        loginIdentityId: identity.id,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    await request(app.getHttpServer()).post('/auth/reset-password').send({ token, newPassword: 'Whatever123!' }).expect(401);
    // And the account is untouched.
    await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'SelfServe123!' }).expect(200);
  }, 60000);
});
