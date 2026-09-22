import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * **عميلُ المستأجر في الاختبارات** (`ق-١٠٢٩`/②): العقدُ يُربط بعميلٍ بمعرّفه لا باسمه (`§6.3` · `ق-٤٩٧`)،
 * فكلُّ اختبارٍ كان يُنشئ عقداً بـ`tenant`/`phone` نصّاً يُنشئ العميلَ أولاً هنا ثم يمرّر `customerId`.
 * `allowSameName: true` لأن الاختباراتِ تعيد الأسماءَ نفسَها عبر التشغيلات على منشأةٍ واحدة — والتنبيهُ
 * «يوجد عميلٌ بهذا الاسم، أهو نفسُه؟» مقصودٌ للتاجر لا للحزمة (`ق-١٠٢٨`/⑤).
 */
export async function createTenantCustomer(app: INestApplication, token: string, name: string, phone?: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({ kind: 'NATURAL', name, ...(phone ? { phone } : {}), allowSameName: true })
    .expect(201);
  return (res.body as { id: string }).id;
}
