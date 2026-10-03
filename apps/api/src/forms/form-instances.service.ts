import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FormInstanceStatus, FormItemType, FormTemplateStatus, Prisma } from '@mad-app/db';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { dayStartOf } from '../common/wall-clock.util';
import { NUMERIC_ITEM_TYPES } from './form-template-items.util';
import { sealHash, type SealContent, type SealItemValue } from './seal-content.util';

type Tx = Prisma.TransactionClient;

/** ما يخصّه السجلّ — يكتبه النشاطُ الطالب بعد أن يتحقّق منه؛ والمحرّكُ يقابله ولا يعرف معناه. */
export interface FormSubject {
  type: string;
  id: string;
}

/** الفاعلُ كما يُختم: معرّفُ ملفّه واسمُ دخوله وقتَ الفعل. */
export interface FormActor {
  id: string;
  name: string;
}

export interface FormValueInput {
  itemId: string;
  text?: string | null;
  number?: number | null;
  bool?: boolean | null;
  note?: string | null;
}

/** سلسلةُ الرقم الواحد للأنواع كلِّها (`ق-١٦٣٦` ج): `FRM-<السنة>-<التسلسل>` من العدّاد الذرّيّ. */
const FRM_SEQUENCE = { kind: 'FRM', pad: 4 } as const;

const INSTANCE_INCLUDE = {
  template: { include: { formType: true, items: { orderBy: { lineNo: 'asc' } } } },
  values: true,
} as const;

type InstanceFull = Prisma.FormInstanceGetPayload<{ include: typeof INSTANCE_INCLUDE }>;
type TemplateItem = InstanceFull['template']['items'][number];
type ValueRow = InstanceFull['values'][number];

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const blank = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

/** القيمةُ فارغةٌ بنوع بندها — والملاحظةُ وحدَها ليست قيمة. */
function isEmpty(item: TemplateItem, v: ValueRow | undefined): boolean {
  if (!v) return true;
  if (item.itemType === FormItemType.BOOLEAN) return v.boolValue === null;
  if (NUMERIC_ITEM_TYPES.has(item.itemType)) return v.numberValue === null;
  return v.textValue === null;
}

/** الانحرافُ يُحسب لا يُكتب (القاعدةُ ٣ من §٦.٢): رقمٌ خارج نطاق بنده. */
function outOfRange(item: TemplateItem, v: ValueRow | undefined): boolean {
  if (!v || v.numberValue === null || !NUMERIC_ITEM_TYPES.has(item.itemType)) return false;
  const n = Number(v.numberValue);
  return (item.minValue !== null && n < Number(item.minValue)) || (item.maxValue !== null && n > Number(item.maxValue));
}

function sealItems(instance: InstanceFull): SealItemValue[] {
  const byItem = new Map(instance.values.map((v) => [v.itemId, v]));
  return instance.template.items.map((item) => {
    const v = byItem.get(item.id);
    return {
      lineNo: item.lineNo,
      itemId: item.id,
      label: item.label,
      itemType: item.itemType,
      text: v?.textValue ?? null,
      number: v?.numberValue === null || v?.numberValue === undefined ? null : v.numberValue.toString(),
      bool: v?.boolValue ?? null,
      note: v?.note ?? null,
    };
  });
}

/** نصُّ الختم من الصفوف كما خُزّنت — للختم وللتحقّق بالدالّة نفسِها. */
function sealContentOf(instance: InstanceFull, stamp: { no: string; sealSeq: number; prevHash: string | null; sealedBy: FormActor; sealedAt: Date }): SealContent {
  return {
    companyId: instance.companyId,
    instanceId: instance.id,
    no: stamp.no,
    sealSeq: stamp.sealSeq,
    prevHash: stamp.prevHash,
    formDate: instance.formDate.toISOString().slice(0, 10),
    template: { id: instance.template.id, familyId: instance.template.familyId, version: instance.template.version, name: instance.template.name },
    formTypeCode: instance.template.formType.code,
    subject: { type: instance.subjectType, id: instance.subjectId },
    items: sealItems(instance),
    filledBy: { id: instance.filledById, name: instance.filledByName },
    sealedBy: stamp.sealedBy,
    sealedAt: stamp.sealedAt.toISOString(),
  };
}

export function presentInstance(instance: InstanceFull) {
  const byItem = new Map(instance.values.map((v) => [v.itemId, v]));
  return {
    id: instance.id,
    templateId: instance.templateId,
    template: {
      id: instance.template.id,
      familyId: instance.template.familyId,
      version: instance.template.version,
      name: instance.template.name,
      formType: { id: instance.template.formType.id, code: instance.template.formType.code, name: instance.template.formType.name },
    },
    subjectType: instance.subjectType,
    subjectId: instance.subjectId,
    formDate: instance.formDate.toISOString().slice(0, 10),
    status: instance.status,
    no: instance.no,
    sealSeq: instance.sealSeq,
    contentHash: instance.contentHash,
    prevHash: instance.prevHash,
    filledByName: instance.filledByName,
    sealedByName: instance.sealedByName,
    sealedAt: iso(instance.sealedAt),
    createdAt: instance.createdAt.toISOString(),
    items: instance.template.items.map((item) => {
      const v = byItem.get(item.id);
      return {
        itemId: item.id,
        lineNo: item.lineNo,
        label: item.label,
        itemType: item.itemType,
        required: item.required,
        minValue: item.minValue === null ? null : item.minValue.toString(),
        maxValue: item.maxValue === null ? null : item.maxValue.toString(),
        isBlocking: item.isBlocking,
        unit: item.unit,
        helpText: item.helpText,
        text: v?.textValue ?? null,
        number: v?.numberValue === null || v?.numberValue === undefined ? null : v.numberValue.toString(),
        bool: v?.boolValue ?? null,
        note: v?.note ?? null,
        outOfRange: outOfRange(item, v),
      };
    }),
  };
}

/**
 * ⚖️ **محرّكُ النماذج — الموجةُ ١ج: السجلُّ المعبّأ والختم** (توجيه ٢٧٨ · `ق-١٦٣٥` · `ق-١٦٣٦`).
 *
 * **والمحرّكُ لا يعرف نشاطاً** (`CLAUDE.md §3` أ): كلُّ تابعٍ يأخذ الموضوعَ من النشاط الطالب (العقد) ويقابل السجلَّ به، فمسارُ عقدٍ لا يقرأ
 * سجلَّ عقدٍ آخر. **والختمُ** يُسلسَل في المنشأة بقفلٍ استشاريّ داخل معاملته (`pg_advisory_xact_lock`)، فختمان معاً لا يقرآن السابقَ نفسَه
 * فتتفرّع السلسلة؛ والرقمُ من العدّاد الذرّيّ بسنة تاريخ التعبئة؛ والبصمةُ على السجلّ كلِّه وفيها بصمةُ السابق (`seal-content.util.ts`).
 * **والمختومُ** يمنع البرنامجُ تعديلَه هنا، وتمنعه القاعدةُ بمُشغِّلَيها (③ب).
 */
@Injectable()
export class FormInstancesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** سجلٌّ جديد مسوّدةً على إصدارٍ منشورٍ من قالب المنشأة. */
  create(companyId: string, subject: FormSubject, input: { templateId: string; formDate?: string }, actor: FormActor) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // قالبُ المنشأة نفسِها وحدَه (والمركّبُ في القاعدة يحرس الشيءَ نفسَه).
      const template = await tx.formTemplate.findFirst({ where: { id: input.templateId, companyId }, select: { id: true, status: true } });
      if (!template) throw new NotFoundException(MSG.form_template_not_found);
      if (template.status !== FormTemplateStatus.PUBLISHED) throw new BadRequestException(MSG.form_instance_template_not_published);
      // ⚠️ بلا تاريخٍ مُرسَل فيومُ UTC (حدٌّ معلَن في `wall-clock.util`)؛ والشاشةُ ترسل يومَ الجهاز.
      const formDate = input.formDate ? new Date(`${input.formDate}T00:00:00.000Z`) : dayStartOf(new Date());
      const created = await tx.formInstance.create({
        data: { companyId, templateId: template.id, subjectType: subject.type, subjectId: subject.id, formDate, filledById: actor.id, filledByName: actor.name },
        select: { id: true },
      });
      return presentInstance(await this.load(tx, subject, created.id));
    });
  }

  list(companyId: string, subject: FormSubject) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.formInstance.findMany({
        where: { subjectType: subject.type, subjectId: subject.id },
        include: INSTANCE_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return rows.map(presentInstance);
    });
  }

  get(companyId: string, subject: FormSubject, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => presentInstance(await this.load(tx, subject, id)));
  }

  /** تعبئةُ المسوّدة — قيمةٌ لكلِّ بندٍ مُرسَل بنوعه، تحلّ محلَّ قيمته السابقة. */
  setValues(companyId: string, subject: FormSubject, id: string, values: readonly FormValueInput[]) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.load(tx, subject, id);
      if (instance.status !== FormInstanceStatus.DRAFT) throw new ConflictException(MSG.form_instance_sealed);
      const items = new Map(instance.template.items.map((i) => [i.id, i]));
      for (const input of values) {
        const item = items.get(input.itemId);
        if (!item) throw new BadRequestException(MSG.form_value_item_unknown);
        const data = valueDataOf(item, input);
        await tx.formValue.upsert({
          where: { instanceId_itemId: { instanceId: id, itemId: item.id } },
          create: { companyId, instanceId: id, itemId: item.id, ...data },
          update: data,
        });
      }
      return presentInstance(await this.load(tx, subject, id));
    });
  }

  /** حذفُ المسوّدة وحدَها — والمختومُ لا يُحذف (القاعدةُ ٢ من §٦.٢). */
  remove(companyId: string, subject: FormSubject, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.load(tx, subject, id);
      if (instance.status !== FormInstanceStatus.DRAFT) throw new ConflictException(MSG.form_instance_sealed);
      await tx.formInstance.delete({ where: { id } });
    });
  }

  /**
   * **الختم**: يُفحص الإلزاميُّ والمانعُ خارج نطاقه، ثم يُقفل تسلسلُ أختام المنشأة، ويُقرأ السابقُ، ويُصرف الرقم، وتُحسب البصمة، ويُكتب
   * الختمُ كلُّه بشرط أن السجلَّ ما زال مسوّدة.
   */
  seal(companyId: string, subject: FormSubject, id: string, actor: FormActor) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.load(tx, subject, id);
      if (instance.status !== FormInstanceStatus.DRAFT) throw new ConflictException(MSG.form_instance_sealed);

      const byItem = new Map(instance.values.map((v) => [v.itemId, v]));
      const missing = instance.template.items.filter((i) => i.required && isEmpty(i, byItem.get(i.id))).map((i) => i.label);
      if (missing.length) throw new BadRequestException(formatMessage(MSG.form_instance_required_missing, { labels: missing.join('، ') }));
      const blocked = instance.template.items.filter((i) => i.isBlocking && outOfRange(i, byItem.get(i.id))).map((i) => i.label);
      if (blocked.length) throw new BadRequestException(formatMessage(MSG.form_instance_blocking_out_of_range, { labels: blocked.join('، ') }));

      // سلسلةُ الأختام في المنشأة تُسلسَل هنا حتى تلتزم المعاملة (`ق-١٦٣٦` ب).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`form-seal:${companyId}`}))`;
      const previous = await tx.formInstance.findFirst({
        where: { sealSeq: { not: null } },
        orderBy: { sealSeq: 'desc' },
        select: { sealSeq: true, contentHash: true },
      });
      const sealSeq = (previous?.sealSeq ?? 0) + 1;
      const prevHash = previous?.contentHash ?? null;
      // أعلى رقمٍ صدر يُقرأ مرّةً عند بذر العدّاد وحدَه (`ق-٣٢٨`)، والرقمُ فارغٌ للمسوّدة فلا يطابق البادئة.
      const highest = (prefix: string) =>
        highestSequenceOf({ findMany: (args) => tx.formInstance.findMany(args) as unknown as Promise<{ no: string }[]> }, prefix);
      const no = await nextDocumentNumber(tx, companyId, instance.formDate, FRM_SEQUENCE, highest);
      const sealedAt = new Date();
      const contentHash = sealHash(sealContentOf(instance, { no, sealSeq, prevHash, sealedBy: actor, sealedAt }));

      const done = await tx.formInstance.updateMany({
        where: { id, status: FormInstanceStatus.DRAFT },
        data: { status: FormInstanceStatus.SEALED, no, sealSeq, prevHash, contentHash, sealedById: actor.id, sealedByName: actor.name, sealedAt },
      });
      if (done.count !== 1) throw new ConflictException(MSG.form_instance_seal_race);
      return presentInstance(await this.load(tx, subject, id));
    });
  }

  /**
   * **التحقّقُ من المختوم**: تُعاد البصمةُ من الصفوف كما هي وتُقابَل بالمختومة، ويُقابَل السابقُ بموضعه في السلسلة. والتحقّقُ يُعيد الحكمَ
   * ولا يُصلح شيئاً.
   */
  verify(companyId: string, subject: FormSubject, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.load(tx, subject, id);
      if (instance.status !== FormInstanceStatus.SEALED || instance.no === null || instance.sealSeq === null || instance.sealedAt === null) {
        throw new ConflictException(MSG.form_instance_not_sealed);
      }
      const recomputed = sealHash(
        sealContentOf(instance, {
          no: instance.no,
          sealSeq: instance.sealSeq,
          prevHash: instance.prevHash,
          sealedBy: { id: instance.sealedById ?? '', name: instance.sealedByName ?? '' },
          sealedAt: instance.sealedAt,
        }),
      );
      const previous =
        instance.sealSeq > 1 ? await tx.formInstance.findFirst({ where: { sealSeq: instance.sealSeq - 1 }, select: { contentHash: true } }) : null;
      const chainLinked = instance.sealSeq === 1 ? instance.prevHash === null : previous?.contentHash === instance.prevHash;
      return {
        no: instance.no,
        contentHash: instance.contentHash,
        recomputedHash: recomputed,
        contentIntact: recomputed === instance.contentHash,
        chainLinked,
        valid: recomputed === instance.contentHash && chainLinked,
      };
    });
  }

  private async load(tx: Tx, subject: FormSubject, id: string): Promise<InstanceFull> {
    const instance = await tx.formInstance.findUnique({ where: { id }, include: INSTANCE_INCLUDE });
    // سجلُّ موضوعٍ آخر لا يُرى من مسار هذا الموضوع.
    if (!instance || instance.subjectType !== subject.type || instance.subjectId !== subject.id) throw new NotFoundException(MSG.form_instance_not_found);
    return instance;
  }
}

/** القيمةُ بنوع بندها — وما لا يطابق النوعَ يُردّ مسمّىً، والقيمةُ الفارغةُ تُفرغ الحقل. */
function valueDataOf(item: TemplateItem, input: FormValueInput): { textValue: string | null; numberValue: string | null; boolValue: boolean | null; note: string | null } {
  const label = item.label;
  const note = blank(input.note);
  const hasText = input.text !== undefined && input.text !== null;
  const hasNumber = input.number !== undefined && input.number !== null;
  const hasBool = input.bool !== undefined && input.bool !== null;
  if (item.itemType === FormItemType.BOOLEAN) {
    if (hasText || hasNumber) throw new BadRequestException(formatMessage(MSG.form_value_type_mismatch, { label }));
    return { textValue: null, numberValue: null, boolValue: hasBool ? Boolean(input.bool) : null, note };
  }
  if (NUMERIC_ITEM_TYPES.has(item.itemType)) {
    if (hasText || hasBool) throw new BadRequestException(formatMessage(MSG.form_value_type_mismatch, { label }));
    if (hasNumber && item.itemType === FormItemType.QTY && !Number.isInteger(input.number)) {
      throw new BadRequestException(formatMessage(MSG.form_value_qty_whole, { label }));
    }
    return { textValue: null, numberValue: hasNumber ? String(input.number) : null, boolValue: null, note };
  }
  if (hasNumber || hasBool) throw new BadRequestException(formatMessage(MSG.form_value_type_mismatch, { label }));
  return { textValue: blank(input.text), numberValue: null, boolValue: null, note };
}
