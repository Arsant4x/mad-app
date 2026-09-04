import type { Prisma } from '@prisma/client';
import { EventBus, type DomainEvent } from './event-bus';

const tx = {} as Prisma.TransactionClient;
const ev = (type: string): DomainEvent => ({ type, companyId: 'c1', payload: { id: 'x' } });

/**
 * **السلوكان هما القرار** (`ق-٣٩`): حدثُ الامتثال يُسقط العملية حين يفشل، وحدثُ
 * التشغيل لا يمسّها. وكلٌّ منهما يُثبَت **بفشلٍ مُفتعَل**، لا بنجاحٍ وحده — فناقلٌ
 * ينجح دائماً لا يقول شيئاً عن أيّهما.
 */
describe('ناقل الأحداث — سلوكان', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
  });

  it('الامتثال: يجري بالترتيب داخل المعاملة نفسها', async () => {
    const order: string[] = [];
    bus.onCompliance('invoice.issued', async () => void order.push('أول'));
    bus.onCompliance('invoice.issued', async () => void order.push('ثانٍ'));

    const ran = await bus.emitCompliance(tx, ev('invoice.issued'));
    expect(ran).toBe(2);
    expect(order).toEqual(['أول', 'ثانٍ']);
  });

  it('🔴 والامتثال يُصعِّد الفشل — فتُلغى المعاملة ولا يبقى مستندٌ بلا أثره', async () => {
    const after: string[] = [];
    bus.onCompliance('invoice.issued', async () => {
      throw new Error('تعذّر كتابة صفّ الإرسال');
    });
    bus.onCompliance('invoice.issued', async () => void after.push('لا ينبغي أن يجري'));

    await expect(bus.emitCompliance(tx, ev('invoice.issued'))).rejects.toThrow('تعذّر كتابة صفّ الإرسال');
    // ولا يكمل البقية: العملية ساقطة، فتشغيلُ ما بعدها يكتب أثراً لعمليةٍ لن توجد.
    expect(after).toEqual([]);
  });

  it('🔴 والتشغيل لا يُسقط شيئاً — فشلُه يُسجَّل ويمضي البقية', async () => {
    const seen: string[] = [];
    const failures: string[] = [];
    bus.setFailureSink((e, err) => failures.push(`${e.type}: ${(err as Error).message}`));

    bus.onOperational('note.issued.late', () => {
      throw new Error('مزوّد البريد ساقط');
    });
    bus.onOperational('note.issued.late', () => void seen.push('الجرس ارتفع'));

    // لا يرمي ولا يُنتظر — وهو نصّ العقد.
    expect(() => bus.emitOperational(ev('note.issued.late'))).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(seen).toEqual(['الجرس ارتفع']);
    expect(failures).toEqual(['note.issued.late: مزوّد البريد ساقط']);
  });

  it('وحدثٌ بلا مستمع لا يفشل — فرفعُه لا يشترط وجود من يسمعه', async () => {
    expect(await bus.emitCompliance(tx, ev('لا أحد يسمعه'))).toBe(0);
    expect(() => bus.emitOperational(ev('لا أحد يسمعه'))).not.toThrow();
  });

  it('ولا يخلط النوعين: مستمعُ التشغيل لا يجري في مسار الامتثال', async () => {
    const ran: string[] = [];
    bus.onOperational('invoice.issued', () => void ran.push('تشغيليّ'));

    expect(await bus.emitCompliance(tx, ev('invoice.issued'))).toBe(0);
    expect(ran).toEqual([]);
  });

  it('ومستمعُ الامتثال لا يجري في مسار التشغيل — فلا يُكتب أثرٌ خارج المعاملة', async () => {
    const ran: string[] = [];
    bus.onCompliance('invoice.issued', async () => void ran.push('امتثاليّ'));

    bus.emitOperational(ev('invoice.issued'));
    await new Promise((r) => setImmediate(r));
    expect(ran).toEqual([]);
  });
});
