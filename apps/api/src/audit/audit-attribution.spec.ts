import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AUDIT_CREATED_ID_PATH_KEY, AUDIT_ENTITY_FROM_RESULT_KEY } from './audit-entity-from-result.decorator';
import type { AuditService } from './audit.service';

/**
 * **من يُسمّيه صفُّ التدقيق؟**
 *
 * كان المعترض يقرأ اسمين مكتوبين بأيديهما (`id` و`contractId`)، فصار مرفق العقد
 * يُنسب إلى العقد ومرفقُ فاتورة الشراء يُنسب إلى المرفق — **والعملية واحدة**.
 * ثم إن كل مستندٍ يُنشأ تحت معرّف أبيه كان بلا اسم: «جرى شيءٌ على العقد» بينما
 * دفعتان على العقد نفسه لا تُفرَّقان.
 *
 * هذه الحالات تُثبت الثلاثة: الأب يُختار **بقيمة** الوسيط لا باسمه · والابن
 * يُسمَّى في `details.createdId` · والوسم الصريح وحده يُظهر ما لا يظهر بلا وسم.
 */
describe('نسبة صفّ التدقيق', () => {
  const ID = {
    contract: '11111111-1111-4111-8111-111111111111',
    purchase: '22222222-2222-4222-8222-222222222222',
    attachment: '33333333-3333-4333-8333-333333333333',
    invoice: '44444444-4444-4444-8444-444444444444',
    note: '55555555-5555-4555-8555-555555555555',
    quote: '66666666-6666-4666-8666-666666666666',
    payment: '77777777-7777-4777-8777-777777777777',
  };

  type Recorded = { entity: string; entityId: string | null; details: Record<string, unknown> | null };

  /** يشغّل المعترض على طلبٍ مُصطنَع ويعيد ما سُجِّل فعلاً. */
  async function run(args: { path: string; params: Record<string, string>; result: unknown; metadata?: Record<string, unknown> }): Promise<Recorded> {
    const recorded: Recorded[] = [];
    const audit = { record: (e: Recorded) => { recorded.push(e); return Promise.resolve(); } } as unknown as AuditService;
    const reflector = {
      getAllAndOverride: (key: string) => (args.metadata ?? {})[key],
    } as unknown as Reflector;

    const req = {
      method: 'POST',
      path: args.path,
      params: args.params,
      body: { note: 'ملاحظة' },
      ip: '127.0.0.1',
      tenant: { companyId: 'c1', actorType: 'COMPANY', profileId: 'p1' },
      user: { username: 'demo-company-a' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    const next = { handle: () => of(args.result) } as CallHandler;

    await new Promise<void>((resolve) => {
      new AuditInterceptor(reflector, audit).intercept(context, next).subscribe({ complete: () => resolve() });
    });
    expect(recorded).toHaveLength(1);
    return recorded[0];
  }

  it('الأب يُختار بقيمة الوسيط لا باسمه — فمرفقا العقد والشراء يُنسبان لأبويهما سواءً', async () => {
    const onContract = await run({
      path: `/contracts/${ID.contract}/attachments`,
      params: { contractId: ID.contract },
      result: { id: ID.attachment },
    });
    const onPurchase = await run({
      path: `/purchases/${ID.purchase}/attachments`,
      params: { purchaseId: ID.purchase },
      result: { id: ID.attachment },
    });

    // قبل الإصلاح: الأول العقد والثاني المرفق — لأن `purchaseId` اسمٌ لا يعرفه المعترض.
    expect(onContract.entityId).toBe(ID.contract);
    expect(onPurchase.entityId).toBe(ID.purchase);
    // وفي الحالتين يُسمَّى المرفق نفسه إلى جانب أبيه.
    expect(onContract.details?.createdId).toBe(ID.attachment);
    expect(onPurchase.details?.createdId).toBe(ID.attachment);
  });

  it('مقطعٌ ليس معرّفاً لا يُؤخذ أباً — /trash/:entity/:id/restore', async () => {
    const row = await run({
      path: `/trash/invoices/${ID.invoice}/restore`,
      params: { entity: 'invoices', id: ID.invoice },
      result: { id: ID.invoice },
    });
    expect(row.entityId).toBe(ID.invoice);
    expect(row.details?.createdId).toBeUndefined();
  });

  it('دفعتان على العقد نفسه تُفرَّقان — وهو ما كان مستحيلاً', async () => {
    const first = await run({ path: `/contracts/${ID.contract}/payments`, params: { id: ID.contract }, result: { id: ID.payment } });
    const second = await run({ path: `/contracts/${ID.contract}/payments`, params: { id: ID.contract }, result: { id: ID.invoice } });
    expect(first.entityId).toBe(second.entityId);
    expect(first.details?.createdId).not.toBe(second.details?.createdId);
  });

  it('الإشعار الدائن مستندٌ قائم بذاته — فالوسم الصريح يجعله هو المُدقَّق', async () => {
    const tagged = await run({
      path: `/invoices/${ID.invoice}/credit-note`,
      params: { id: ID.invoice },
      result: { id: ID.note },
      metadata: { [AUDIT_ENTITY_FROM_RESULT_KEY]: true },
    });
    expect(tagged.entityId).toBe(ID.note);

    // وبلا الوسم يعود إلى الفاتورة الأم — فالوسم هو الفارق لا الصدفة.
    const untagged = await run({ path: `/invoices/${ID.invoice}/credit-note`, params: { id: ID.invoice }, result: { id: ID.note } });
    expect(untagged.entityId).toBe(ID.invoice);
  });

  it('فاتورةٌ يلدها تحويل العرض تُسمَّى بالوسم — وبدونه تغيب غياباً كاملاً', async () => {
    const result = { quote: { id: ID.quote }, invoice: { id: ID.invoice } };

    // برهانٌ عكسي: بلا الوسم لا أثر للفاتورة في الصفّ كلّه، لا في المعرّف ولا في التفاصيل.
    const blind = await run({ path: `/quotes/${ID.quote}/convert`, params: { id: ID.quote }, result });
    expect(blind.entityId).toBe(ID.quote);
    expect(JSON.stringify(blind)).not.toContain(ID.invoice);

    const seeing = await run({
      path: `/quotes/${ID.quote}/convert`,
      params: { id: ID.quote },
      result,
      metadata: { [AUDIT_CREATED_ID_PATH_KEY]: 'invoice.id' },
    });
    // العرض يبقى هو المُدقَّق — فهو ما فعله المستخدم — والفاتورة تُسمَّى إلى جانبه.
    expect(seeing.entityId).toBe(ID.quote);
    expect(seeing.details?.createdId).toBe(ID.invoice);
  });

  it('لا معرّفَ ابنٍ حين تعيد المعالجة أباها نفسه — فلا حشوَ في التفاصيل', async () => {
    const row = await run({ path: `/contracts/${ID.contract}/cancel`, params: { id: ID.contract }, result: { id: ID.contract } });
    expect(row.entityId).toBe(ID.contract);
    expect(row.details?.createdId).toBeUndefined();
  });
});
