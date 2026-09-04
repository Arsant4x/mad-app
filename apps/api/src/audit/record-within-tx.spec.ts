import { AuditService, type AuditEntryInput } from './audit.service';

/**
 * `ق-١٤٧` — **شهادةُ الفعل تُكتب بمعاملته**.
 *
 * ثلاثةٌ تُثبَت هنا بلا قاعدة بيانات، وكلٌّ منها كان يمكن أن يقع عكسه بصمت:
 *
 *   ① تُكتب بـ**عميل المعاملة المُمرَّر** لا بعميلٍ آخر — وإلا لم تتراجع معها.
 *   ② **فشلُها يُرمى ولا يُبتلع** — فمن قرّر أن الشهادة شرطٌ، ابتلاعُ فشلها
 *      يعيده إلى ما هرب منه: فعلٌ حُفظ بلا شهادة.
 *   ③ وتبني **الجملة المقروءة** نفسها التي يبنيها المسار العادي — فلا يصير
 *      سجلٌّ بلغتين.
 */
describe('AuditService.recordWithinTx — الشهادة بمعاملة فاعلها', () => {
  const service = new AuditService(null as never, null as never);

  const input: AuditEntryInput = {
    companyId: 'c1',
    actorType: 'COMPANY',
    actorId: 'c1',
    actorName: 'مالك المنشأة',
    screen: 'inventory',
    action: 'self-review',
    entity: 'inventory-write-offs',
    entityId: 'wo1',
    method: 'POST',
    path: '/inventory/write-offs/wo1/approve',
    details: { no: 'WO-2026-0001' },
    ip: null,
  };

  function fakeTx(create: (args: { data: Record<string, unknown> }) => unknown) {
    return { auditLog: { create } } as never;
  }

  it('🔴 تكتب بعميل المعاملة المُمرَّر — لا بعميلٍ آخر', async () => {
    const calls: Record<string, unknown>[] = [];
    await service.recordWithinTx(fakeTx(({ data }) => calls.push(data)), input);

    expect(calls).toHaveLength(1);
    expect({ action: calls[0].action, entity: calls[0].entity, entityId: calls[0].entityId }).toEqual({
      action: 'self-review',
      entity: 'inventory-write-offs',
      entityId: 'wo1',
    });
  });

  it('🔴 وفشلُها يُرمى ولا يُبتلع — فالشهادة شرطٌ لا محاولة', async () => {
    const boom = new Error('تعذّرت الكتابة');
    await expect(
      service.recordWithinTx(
        fakeTx(() => {
          throw boom;
        }),
        input,
      ),
    ).rejects.toThrow(boom);
  });

  it('وتبني الجملة المقروءة كما يبنيها المسار العادي — لا سجلَّ بلغتين', async () => {
    let saved: Record<string, unknown> | null = null;
    await service.recordWithinTx(fakeTx(({ data }) => (saved = data)), input);

    // الجملة تُبنى من الفعل والكيان، ورقم الواقعة يُذكر لأنه في `details.no`.
    const summary = String((saved as unknown as Record<string, unknown>).summary);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('WO-2026-0001');
  });
});
