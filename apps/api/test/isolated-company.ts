import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

/**
 * **منشأةٌ معزولةٌ للاختبار** (`ق-٧٢٢` · `§8.30`): تُنشأ **بالمسار الحقيقيّ** (`POST /auth/register` — الميلادُ
 * الذي يزرع الدليلَ الافتراضيّ) وتُزال بعد الحزمة — فاختبارٌ يُنشئ بنكاً أو درجاً **لا يستهلك رموزَ منشأة
 * العرض**: المولّدُ `MAX+1` لا يعود إلى الفجوات (`ق-١٩٨`)، وقد استنفدت دوراتُ الاختبار نطاقَي البنوك فيها
 * (`276` من `371` بنكاً بحركةٍ أنشأتها الاختبارات — `ق-٧١٢`). «المسابيرُ الحيّة تصنع صفوفَها ولا تعتمد على ما
 * تركته البذرة» — والعلّةُ كانت أن هذا خُرق، لا أن الآليّة قاصرة.
 *
 * **والإزالةُ تُقاس لا تُفترض**: إن بقيت المنشأةُ (قيدُ `Restrict` على مهامّ أو تفويض) يُرمى خطأٌ يسمّيها —
 * لا تُترك بصمت، فتراكمٌ صامتٌ هو ما أوصل منشأةَ العرض إلى `409`.
 */
export interface IsolatedCompany {
  companyId: string;
  token: string;
  username: string;
}

export const ISOLATED_PASSWORD = 'IsoPass1234!';

export async function registerIsolatedCompany(app: INestApplication, tag: string): Promise<IsolatedCompany> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const username = `iso-${tag}-${stamp}`;
  // ⚠️ تسخينُ الاتصال قبل معاملة التسجيل (2026-09-21): أوّلُ استعلامٍ في عمليةٍ باردة (إقلاعُ محرّك Prisma + الاتصال)
  //    كان يُحسب داخل معاملة التسجيل ذات المهلة 5 s فتسقط بـ`5473 ms`/`6394 ms` على جهازٍ مثقَل — والمهلةُ قرارٌ لا
  //    يُرفع؛ فيُدفع ثمنُ البرودة خارجها. لا أثرَ على المنتج: التسخينُ استعلامٌ ثابت.
  await app.get(PrismaService).$queryRaw`SELECT 1`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ orgName: `منشأة معزولة ${tag} ${stamp}`, username, password: ISOLATED_PASSWORD, email: `${username}@example.com` })
    .expect(201);
  const companyId: string | null = res.body.user?.companyId ?? null;
  if (!companyId) throw new Error(`التسجيلُ لم يُعد معرّفَ منشأة: ${JSON.stringify(res.body).slice(0, 200)}`);
  return { companyId, token: res.body.accessToken as string, username };
}

/** يُزيل المنشأةَ ويُثبت زوالَها — يُستدعى في `afterAll` قبل `app.close()`. */
export async function removeIsolatedCompany(app: INestApplication, company: IsolatedCompany | undefined): Promise<void> {
  if (!company) return;
  const prisma = app.get(PrismaService);
  await hardDeleteCompanyForTest(prisma, company.companyId);
  const left = await prisma.company.count({ where: { id: company.companyId } });
  if (left !== 0) throw new Error(`منشأةُ الاختبار ${company.username} (${company.companyId}) لم تُزَل — قيدُ Restrict يُبقيها`);
}
