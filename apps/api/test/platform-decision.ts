import { INestApplication } from '@nestjs/common';
import { PlatformDecisionAction, PlatformRole } from '@mad-app/db';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * **اليدُ الثانية للحزم التي تمسّ فعلاً حرجاً** (`ق-١٣١٨` · ⑪A1).
 *
 * الفعلُ الحرج (إغلاقُ حسابٍ أو محوُه · تعديلُ اشتراك) **لا يمضي بيدٍ واحدة**. فحزمةٌ كانت
 * تنفّذه بمديرٍ واحدٍ تحتاج ثانياً — **وذاك يُثبت الآليةَ لا يلتفّ عليها**: الطلبُ من يدٍ
 * والإقرارُ من أخرى، ثم يمضي الفعل.
 *
 * ⚠️ **ويُزال ما صُنع**: مديرٌ يبقى بعد الحزمة يتراكم على قاعدة التطوير (`ق-٧٢٢`).
 */
const created = new Map<INestApplication, { id: string; token: string }>();

async function secondHand(app: INestApplication): Promise<{ id: string; token: string }> {
  const cached = created.get(app);
  if (cached) return cached;
  const prisma = app.get(PrismaService);
  const username = `second-hand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const password = 'SecondHand123!';
  const identity = await prisma.loginIdentity.create({
    data: { username, passwordHash: await argon2.hash(password), actorType: 'PLATFORM_ADMIN' },
    select: { id: true },
  });
  await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: 'يدٌ ثانية للاختبار', role: PlatformRole.OWNER } });
  const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password }).expect(200);
  const made = { id: identity.id, token: login.body.accessToken as string };
  created.set(app, made);
  return made;
}

/**
 * **يطلب القرارَ بيدٍ ويُقرّه بأخرى** — فيصير الفعلُ الحرج ممكناً في الحزمة.
 *
 * `requesterToken` يدُ الحزمة نفسِها؛ والإقرارُ من اليد الثانية.
 * A subscription change carries the end date it approves in `values.subEnd`.
 */
export async function grantPlatformDecision(
  app: INestApplication,
  action: PlatformDecisionAction,
  targetId: string,
  requesterToken: string,
  values: { subEnd?: string } = {},
): Promise<void> {
  const other = await secondHand(app);
  const asked = await request(app.getHttpServer())
    .post('/admin/decisions')
    .set('Authorization', `Bearer ${requesterToken}`)
    .send({ action, targetId, summary: `إقرارٌ للاختبار على ${targetId}`, ...values })
    .expect(201);
  await request(app.getHttpServer()).post(`/admin/decisions/${asked.body.id}/approve`).set('Authorization', `Bearer ${other.token}`).expect(201);
}

/** يُزيل اليدَ الثانية وقراراتِها — يُستدعى في `afterAll` قبل `app.close()`. */
export async function releaseSecondHand(app: INestApplication): Promise<void> {
  const made = created.get(app);
  if (!made) return;
  const prisma = app.get(PrismaService);
  const admin = await prisma.platformAdmin.findUnique({ where: { loginIdentityId: made.id }, select: { id: true } });
  if (admin) {
    // القراراتُ تشير إلى المديرَين بـ`Restrict` — فتُزال قبلهما (وهي من صنع الحزمة وحدها).
    await prisma.platformDecision.deleteMany({ where: { OR: [{ requestedById: admin.id }, { decidedById: admin.id }, { executedById: admin.id }] } });
  }
  await prisma.loginIdentity.delete({ where: { id: made.id } }).catch(() => undefined);
  created.delete(app);
}
