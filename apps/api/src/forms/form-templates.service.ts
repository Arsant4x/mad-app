import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FormTemplateStatus, Prisma, type FormType } from '@mad-app/db';
import { randomUUID } from 'node:crypto';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CopyFormTemplateDto, CreateFormTemplateDto, CreateFormTypeDto, UpdateFormTemplateDto, UpdateFormTypeDto } from './dto/form-template.dto';
import { normalizeTemplateItems, type TemplateItemRow } from './form-template-items.util';

type Tx = Prisma.TransactionClient;

/**
 * نطاقُ الفاعل (`CLAUDE.md §3.5` · قرارُ الخطّة ٤٣):
 *   · المنصّة (`companyId: null`) تملك القوالبَ العامّة في لوحة المطوّر — معاملتُها بمسنَد الإدارة.
 *   · المنشأة تملك نسخَها في شاشاتها — معاملتُها في سياقها، وترى معها العامَّ المنشورَ لتنسخ منه.
 */
export type FormScope = { companyId: string | null };

function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.owner_only);
}

const isUniqueViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const TEMPLATE_INCLUDE = { formType: true, items: { orderBy: { lineNo: 'asc' } } } as const;
const ROW_INCLUDE = { formType: true, _count: { select: { items: true } } } as const;

type TemplateWithItems = Prisma.FormTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;
type TemplateRow = Prisma.FormTemplateGetPayload<{ include: typeof ROW_INCLUDE }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function presentType(t: FormType) {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    sector: t.sector,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function presentHead(t: TemplateWithItems | TemplateRow) {
  return {
    id: t.id,
    companyId: t.companyId,
    formTypeId: t.formTypeId,
    formType: presentType(t.formType),
    familyId: t.familyId,
    version: t.version,
    status: t.status,
    name: t.name,
    description: t.description,
    sourceTemplateId: t.sourceTemplateId,
    publishedAt: iso(t.publishedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function presentTemplate(t: TemplateWithItems) {
  return {
    ...presentHead(t),
    items: t.items.map((i) => ({
      id: i.id,
      lineNo: i.lineNo,
      label: i.label,
      itemType: i.itemType,
      required: i.required,
      minValue: i.minValue === null ? null : i.minValue.toString(),
      maxValue: i.maxValue === null ? null : i.maxValue.toString(),
      isBlocking: i.isBlocking,
      unit: i.unit,
      helpText: i.helpText,
    })),
  };
}

function presentRow(t: TemplateRow, sourceLatestVersion: number | null) {
  return { ...presentHead(t), itemCount: t._count.items, sourceLatestVersion };
}

/**
 * ⚖️ **محرّكُ النماذج — الموجةُ ١أ: الأنواعُ والقوالبُ المُصدَّرة** (توجيه ٢٧٨ · `ق-١٦٣٤` · الخطّة §٦.١ و§٦.٢).
 *
 * **القاعدةُ الأولى من §٦.٢**: القالبُ مُصدَّر — المنشورُ لا يُعدَّل بل يُبنى بعده إصدارٌ جديد، والسجلُّ المعبّأ (الموجة ١ج)
 * يشير إلى **الإصدار** لا إلى القالب. فكلُّ تحريرٍ هنا على المسوّدة وحدَها، والنشرُ يؤرشف المنشورَ قبله في المعاملة نفسِها.
 * **والمحرّكُ لا يعرف نشاطاً** (`CLAUDE.md §3` أ): نشاطُ النوع وصفٌ يُعرض لا فرعٌ في الشيفرة.
 */
@Injectable()
export class FormTemplatesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    // `form_types` كتالوجُ منصّةٍ بلا `companyId` ولا عزل — يُقرأ ويُكتب خارج سياق المستأجر.
    private readonly prisma: PrismaService,
  ) {}

  private inScope<T>(scope: FormScope, work: (tx: Tx) => Promise<T>): Promise<T> {
    return scope.companyId ? this.tenantPrisma.runInTenantContext(scope.companyId, work) : this.tenantPrisma.runAsPlatformAdmin(work);
  }

  // ── الأنواع (المنصّة) ─────────────────────────────────────────────────────

  async listTypes() {
    const types = await this.prisma.formType.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return types.map(presentType);
  }

  async createType(dto: CreateFormTypeDto) {
    try {
      const t = await this.prisma.formType.create({
        data: { code: dto.code, name: dto.name.trim(), description: dto.description?.trim() || null, sector: dto.sector ?? null },
      });
      return presentType(t);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(MSG.form_type_code_taken);
      throw e;
    }
  }

  async updateType(id: string, dto: UpdateFormTypeDto) {
    const found = await this.prisma.formType.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(MSG.form_type_not_found);
    const t = await this.prisma.formType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.sector !== undefined ? { sector: dto.sector } : {}),
      },
    });
    return presentType(t);
  }

  // ── القراءة ───────────────────────────────────────────────────────────────

  /** إصداراتُ النطاق كلُّها: للمنصّة قوالبُها العامّة، وللمنشأة نسخُها — ومع النسخة آخرُ إصدارٍ منشورٍ من أصلها. */
  list(scope: FormScope) {
    return this.inScope(scope, async (tx) => {
      const rows = await tx.formTemplate.findMany({
        where: { companyId: scope.companyId },
        include: ROW_INCLUDE,
        orderBy: [{ familyId: 'asc' }, { version: 'asc' }],
      });
      const latest = await this.sourceLatestVersions(tx, rows);
      return rows.map((r) => presentRow(r, r.sourceTemplateId ? (latest.get(r.sourceTemplateId) ?? null) : null));
    });
  }

  /** كتالوجُ القوالب العامّة للمنشأة: المنشورُ وحدَه من كلِّ قالب، لتنسخ منه. */
  catalog(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.formTemplate.findMany({
        where: { companyId: null, status: FormTemplateStatus.PUBLISHED },
        include: ROW_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return rows.map((r) => presentRow(r, null));
    });
  }

  /** إصدارٌ ببنوده: للمنشأة نسخُها وما نُشر من العامّ (لا مسوّدتُه)، وللمنصّة قوالبُها. */
  get(scope: FormScope, id: string) {
    return this.inScope(scope, async (tx) => presentTemplate(await this.visible(tx, scope, id)));
  }

  // ── الكتابة ───────────────────────────────────────────────────────────────

  /** قالبٌ عامٌّ جديد — من لوحة المطوّر وحدَها؛ والتاجرُ يبدأ من نسخة (قرارُ الخطّة ٤٣). */
  create(dto: CreateFormTemplateDto) {
    const rows = normalizeTemplateItems(dto.items);
    return this.tenantPrisma.runAsPlatformAdmin(async (tx) => {
      const type = await tx.formType.findUnique({ where: { id: dto.formTypeId }, select: { id: true } });
      if (!type) throw new NotFoundException(MSG.form_type_not_found);
      const id = randomUUID();
      await tx.formTemplate.create({
        data: { id, companyId: null, formTypeId: dto.formTypeId, familyId: id, version: 1, name: dto.name.trim(), description: dto.description?.trim() || null },
      });
      await this.writeItems(tx, null, id, rows);
      return presentTemplate(await this.load(tx, id));
    });
  }

  /** نسخُ إصدارٍ عامٍّ منشور إلى المنشأة: مسوّدةٌ أولى ببنوده، تشير إلى الإصدار الذي نُسخت منه بعينه. */
  copy(companyId: string, actorType: string, dto: CopyFormTemplateDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const source = await tx.formTemplate.findFirst({ where: { id: dto.sourceTemplateId, companyId: null }, include: TEMPLATE_INCLUDE });
      // مسوّدةُ المنصّة لا تُرى خارجها، كما في القراءة.
      if (!source || source.status === FormTemplateStatus.DRAFT) throw new NotFoundException(MSG.form_template_not_found);
      if (source.status !== FormTemplateStatus.PUBLISHED) throw new BadRequestException(MSG.form_template_source_not_published);
      const id = randomUUID();
      await tx.formTemplate.create({
        data: {
          id,
          companyId,
          formTypeId: source.formTypeId,
          familyId: id,
          version: 1,
          name: dto.name?.trim() || source.name,
          description: source.description,
          sourceTemplateId: source.id,
        },
      });
      await this.writeItems(tx, companyId, id, source.items.map(itemRowOf));
      return presentTemplate(await this.load(tx, id));
    });
  }

  /** تحريرُ المسوّدة — والبنودُ إن أُرسلت تحلّ محلَّ بنودها كلِّها. */
  update(scope: FormScope, actorType: string | null, id: string, dto: UpdateFormTemplateDto) {
    if (scope.companyId) assertIsCompanyOwner(actorType ?? '');
    const rows = dto.items ? normalizeTemplateItems(dto.items) : null;
    return this.inScope(scope, async (tx) => {
      const t = await this.owned(tx, scope, id);
      if (t.status !== FormTemplateStatus.DRAFT) throw new ConflictException(MSG.form_template_not_draft);
      await tx.formTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        },
      });
      if (rows) {
        await tx.formTemplateItem.deleteMany({ where: { templateId: id } });
        await this.writeItems(tx, scope.companyId, id, rows);
      }
      return presentTemplate(await this.load(tx, id));
    });
  }

  /**
   * **نشرُ المسوّدة**: تتجمّد بنودُها، ويُؤرشف المنشورُ قبلها في المعاملة نفسِها فيبقى مقروءاً لما عُبّئ عليه.
   * والفهرسان الجزئيّان (منشورٌ واحد · مسوّدةٌ واحدة لكلِّ قالب) يحبسان السباقَ في القاعدة.
   */
  async publish(scope: FormScope, actorType: string | null, id: string) {
    if (scope.companyId) assertIsCompanyOwner(actorType ?? '');
    try {
      return await this.inScope(scope, async (tx) => {
        const t = await this.owned(tx, scope, id);
        if (t.status !== FormTemplateStatus.DRAFT) throw new ConflictException(MSG.form_template_not_draft);
        const items = await tx.formTemplateItem.count({ where: { templateId: id } });
        if (items === 0) throw new BadRequestException(MSG.form_template_empty);
        await tx.formTemplate.updateMany({
          where: { familyId: t.familyId, status: FormTemplateStatus.PUBLISHED },
          data: { status: FormTemplateStatus.ARCHIVED },
        });
        // مشروطٌ بأنها ما زالت مسوّدة: نشرٌ ثانٍ في اللحظة نفسِها لا يكتب فوق الأوّل.
        const done = await tx.formTemplate.updateMany({
          where: { id, status: FormTemplateStatus.DRAFT },
          data: { status: FormTemplateStatus.PUBLISHED, publishedAt: new Date() },
        });
        if (done.count !== 1) throw new ConflictException(MSG.form_template_publish_race);
        return presentTemplate(await this.load(tx, id));
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(MSG.form_template_publish_race);
      throw e;
    }
  }

  /** **إصدارٌ جديد** على المنشور: مسوّدةٌ بالرقم التالي ببنوده، والمنشورُ يبقى سارياً حتى تُنشر. */
  async newVersion(scope: FormScope, actorType: string | null, id: string) {
    if (scope.companyId) assertIsCompanyOwner(actorType ?? '');
    try {
      return await this.inScope(scope, async (tx) => {
        const t = await this.owned(tx, scope, id);
        if (t.status !== FormTemplateStatus.PUBLISHED) throw new BadRequestException(MSG.form_template_version_from_published);
        const draft = await tx.formTemplate.findFirst({ where: { familyId: t.familyId, status: FormTemplateStatus.DRAFT }, select: { id: true } });
        if (draft) throw new ConflictException(MSG.form_template_draft_exists);
        const top = await tx.formTemplate.aggregate({ where: { familyId: t.familyId }, _max: { version: true } });
        const nextId = randomUUID();
        await tx.formTemplate.create({
          data: {
            id: nextId,
            companyId: t.companyId,
            formTypeId: t.formTypeId,
            familyId: t.familyId,
            version: (top._max.version ?? t.version) + 1,
            name: t.name,
            description: t.description,
            sourceTemplateId: t.sourceTemplateId,
          },
        });
        await this.writeItems(tx, t.companyId, nextId, t.items.map(itemRowOf));
        return presentTemplate(await this.load(tx, nextId));
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(MSG.form_template_draft_exists);
      throw e;
    }
  }

  /** حذفُ المسوّدة وحدَها — والمنشورُ لا يُحذف: قد يُعبّأ عليه (القاعدة ١ من §٦.٢). */
  remove(scope: FormScope, actorType: string | null, id: string) {
    if (scope.companyId) assertIsCompanyOwner(actorType ?? '');
    return this.inScope(scope, async (tx) => {
      const t = await this.owned(tx, scope, id);
      if (t.status !== FormTemplateStatus.DRAFT) throw new ConflictException(MSG.form_template_not_draft);
      await tx.formTemplate.delete({ where: { id } });
    });
  }

  // ── مساعدات ───────────────────────────────────────────────────────────────

  private async load(tx: Tx, id: string): Promise<TemplateWithItems> {
    const t = await tx.formTemplate.findUnique({ where: { id }, include: TEMPLATE_INCLUDE });
    if (!t) throw new NotFoundException(MSG.form_template_not_found);
    return t;
  }

  /** ما يراه الفاعل: المنصّةُ قوالبَها، والمنشأةُ نسخَها وما نُشر من العامّ — ومسوّدةُ المنصّة لا تُرى خارجها. */
  private async visible(tx: Tx, scope: FormScope, id: string): Promise<TemplateWithItems> {
    const t = await tx.formTemplate.findUnique({ where: { id }, include: TEMPLATE_INCLUDE });
    if (!t) throw new NotFoundException(MSG.form_template_not_found);
    if (scope.companyId === null && t.companyId !== null) throw new NotFoundException(MSG.form_template_not_found);
    if (scope.companyId !== null && t.companyId === null && t.status === FormTemplateStatus.DRAFT) throw new NotFoundException(MSG.form_template_not_found);
    if (scope.companyId !== null && t.companyId !== null && t.companyId !== scope.companyId) throw new NotFoundException(MSG.form_template_not_found);
    return t;
  }

  /** ما يملك الفاعلُ تحريرَه: قالبُ نطاقه وحدَه — والمنشأةُ أمام العامّ تُردّ برسالةٍ تقول ما تفعل. */
  private async owned(tx: Tx, scope: FormScope, id: string): Promise<TemplateWithItems> {
    const t = await this.visible(tx, scope, id);
    if (t.companyId !== scope.companyId) throw new ForbiddenException(MSG.form_template_platform_owned);
    return t;
  }

  private async writeItems(tx: Tx, companyId: string | null, templateId: string, rows: readonly TemplateItemRow[]): Promise<void> {
    await tx.formTemplateItem.createMany({
      data: rows.map((r) => ({
        companyId,
        templateId,
        lineNo: r.lineNo,
        label: r.label,
        itemType: r.itemType,
        required: r.required,
        minValue: r.minValue,
        maxValue: r.maxValue,
        isBlocking: r.isBlocking,
        unit: r.unit,
        helpText: r.helpText,
      })),
    });
  }

  /** آخرُ إصدارٍ منشورٍ من أصل كلِّ نسخة — يُقرأ من العامّ المرئيّ في السياق نفسِه. */
  private async sourceLatestVersions(tx: Tx, rows: readonly TemplateRow[]): Promise<Map<string, number>> {
    const sourceIds = [...new Set(rows.map((r) => r.sourceTemplateId).filter((s): s is string => s !== null))];
    const out = new Map<string, number>();
    if (sourceIds.length === 0) return out;
    const sources = await tx.formTemplate.findMany({ where: { id: { in: sourceIds }, companyId: null }, select: { id: true, familyId: true } });
    const families = [...new Set(sources.map((s) => s.familyId))];
    const published = await tx.formTemplate.findMany({
      where: { familyId: { in: families }, companyId: null, status: FormTemplateStatus.PUBLISHED },
      select: { familyId: true, version: true },
    });
    const byFamily = new Map(published.map((p) => [p.familyId, p.version]));
    for (const s of sources) {
      const v = byFamily.get(s.familyId);
      if (v !== undefined) out.set(s.id, v);
    }
    return out;
  }
}

/** بندٌ مكتوبٌ يُنسخ كما هو إلى إصدارٍ جديد أو نسخة. */
function itemRowOf(i: TemplateWithItems['items'][number]): TemplateItemRow {
  return {
    lineNo: i.lineNo,
    label: i.label,
    itemType: i.itemType,
    required: i.required,
    minValue: i.minValue === null ? null : i.minValue.toString(),
    maxValue: i.maxValue === null ? null : i.maxValue.toString(),
    isBlocking: i.isBlocking,
    unit: i.unit,
    helpText: i.helpText,
  };
}
