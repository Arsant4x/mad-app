import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { mapList, pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { money } from '../common/money/text';
import { dayEndOf } from '../common/wall-clock.util';
import { customerExposure, exposureOf } from '../reports/receivables-exposure.util';
import { assertCustomerNotInTrash } from './customer-trash.util';
import { TenantContext } from '../auth/types';
import { RecordMarketingConsentDto } from './dto/record-marketing-consent.dto';
import { MarketingChannel, marketingState, mayReceiveMarketing } from './marketing-consent.util';

/**
 * المعرّفُ البديل زوجٌ (BR-KSA-14): مخطّطٌ ورقمٌ معاً، أو لا شيء — نصفُ زوجٍ يُرفض مسمّىً لا يُكمَل صامتاً.
 * المخطّطُ نصٌّ مقيَّدٌ في القاعدة (CHECK على الأحد عشر) فيُخزَّن كما يُرسَل — «700» كما هي.
 */
/**
 * ⑤A3 — رقمُ التسجيل الضريبيّ السعوديّ (`3…3`) لمن سُجّل في المملكة؛ فمشترٍ بلدُه غيرُ `SA` لا يحمله (BR-KSA-46:
 * فاتورةُ الصادرات لا تحمل رقمَ المشتري) — ومعرّفُه الأجنبيّ يُكتب في المعرّف البديل بمخطّطه (`TIN`).
 */
function assertCountryVatConsistent(country: string | null | undefined, vatNumber: string | null | undefined): void {
  const c = country?.trim().toUpperCase() || 'SA';
  if (c !== 'SA' && vatNumber?.trim()) throw new BadRequestException(MSG.customer_foreign_vat_conflict);
}

function otherIdPair(
  scheme: string | null | undefined,
  id: string | null | undefined,
  opts: { clear?: boolean } = {},
): { scheme: string; id: string } | null {
  if (opts.clear) return null;
  const s = scheme?.trim() || null;
  const v = id?.trim() || null;
  if (!s && !v) return null;
  if (!s || !v) throw new BadRequestException(MSG.customer_other_id_pair);
  return { scheme: s, id: v };
}

/** حقولُ البحث المُعلَنة لهذه القائمة (`ق-١٢٣٦`) — الاسمُ والهاتفُ والرقمُ الضريبي. */
const CUSTOMER_SEARCH_FIELDS = ['name', 'phone', 'vatNumber'] as const;

@Injectable()
export class CustomersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * القائمةُ **برصيد كلِّ عميل** — من المصدر الواحد لتعرّض العميل (`customerExposure`: فواتيرُه بمتبقّيها
   * من التخصيصات، وأقساطُ إيجاره المستحقّة) لا من جمع الشاشة (`ق-١٢٤٣`: كانت شاشةُ العملاء تحمّل
   * الفواتيرَ كلَّها وتجمع `outstanding` بنفسها). تمريرةٌ واحدة على المنشأة لا استعلامٌ لكل صفّ؛
   * والرصيدُ نصٌّ بخانتين (`ق-١٢٣٥`)، وصفرٌ لمن لا رصيدَ له. **وعلى مستوى المنشأة** كحدّ الائتمان.
   *
   * ⚖️ **ولذلك لا يُرسل لمن لا يرى الفروعَ كلَّها** (`ق-١٥٨١`): ذمّةُ العميل رقمُ المنشأة كلِّها، فتبقى القائمةُ للمقيَّد بلا
   * `outstanding` (يسقط الحقلُ لا يصير صفراً)، ولا يُحسب التعرّضُ أصلاً.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all', includeArchived = false, query?: PagedQueryDto) {
    const where: Prisma.CustomerWhereInput = { ...(includeArchived ? {} : { archived: false }), ...searchWhere(searchTerm(query), CUSTOMER_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const result = await pagedFindMany(query, tx.customer, { where, orderBy: { name: 'asc' } });
      if (allowedBranchIds !== 'all') return result;
      const exposure = new Map((await customerExposure(tx, { asOf: dayEndOf(new Date()), allowedBranchIds: 'all' })).map((r) => [r.customerId, r.total]));
      return mapList(result, (c) => ({ ...c, outstanding: money(exposure.get(c.id) ?? 0) }));
    });
  }

  /**
   * ملخّصُ العميل — ثلاثةُ أرقامٍ كانت تُجمع في نافذة تفاصيله من إجماليات الفواتير (`ق-١٢٤٣`):
   * **المفوتَر** صافياً من إشعاراته الدائنة (الإجماليُّ موقَّعاً بنوع المستند)، **والمقبوض** من تخصيصات
   * سندات القبض على فواتيره (لا من فواتيرَ ختمُها `PAID` — فالمسدَّدُ جزئياً كان لا يُحسب)، **والرصيدُ**
   * من المصدر الواحد للتعرّض. كلُّها نصٌّ بخانتين.
   *
   * **على مستوى المنشأة بحقّها**: فواتيرُ العميل تُقرأ من فروعها كلِّها — فالمفوتَرُ له والمقبوضُ منه
   * ذمّتُه على المنشأة لا على فرع، كما يقرؤها حدُّ الائتمان.
   */
  summary(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id }, select: { id: true } });
      if (!customer) throw new NotFoundException(MSG.customer_not_found);
      // ④A1: مستندُ الدفعة المقدَّمة ليس مفوتَراً (لا توريدَ بعد) ولا مقبوضاً على فاتورة — يُعرض رقماً رابعاً حتى يُطبَّق.
      const invoices = await tx.invoice.findMany({ where: { customerId: id, docType: { not: 'PREPAYMENT' } }, select: { id: true, docType: true, total: true } });
      const billed = invoices.reduce((s, i) => s + (i.docType === 'CREDIT_NOTE' ? -1 : 1) * Number(i.total), 0);
      const allocated = await tx.paymentAllocation.aggregate({ where: { invoiceId: { in: invoices.map((i) => i.id) } }, _sum: { amount: true } });
      const prepaid = await tx.invoice.aggregate({ where: { customerId: id, docType: 'PREPAYMENT', appliedAsPrepayment: { none: {} } }, _sum: { total: true } });
      return {
        customerId: id,
        billed: money(billed),
        collected: money(Number(allocated._sum.amount ?? 0)),
        outstanding: money(await exposureOf(tx, id, dayEndOf(new Date()))),
        /** دفعاتٌ مقدَّمة (386) لم تُطبَّق بعد على فاتورة توريد — التزامٌ للعميل لا ذمّةٌ عليه. */
        prepaid: money(Number(prepaid._sum.total ?? 0)),
      };
    });
  }

  create(companyId: string, dto: CreateCustomerDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, undefined, dto.allowSameName === true);
      assertCountryVatConsistent(dto.country, dto.vatNumber);
      const otherId = otherIdPair(dto.otherIdScheme, dto.otherId);
      return tx.customer.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          // ②A1: الصفةُ تُذكر في كل إنشاء — لا افتراض؛ والمعرّفُ البديل زوجٌ أو لا شيء؛ والبلدُ `SA` غياباً.
          kind: dto.kind,
          otherIdScheme: otherId?.scheme ?? null,
          otherId: otherId?.id ?? null,
          country: dto.country?.trim() || 'SA',
          vatNumber: dto.vatNumber || null,
          phone: dto.phone || null,
          // العنوان الوطني — `''` تعني «فارغ» لا «نصٌّ فارغ»، فالمستند يقرأ
          // `null` غياباً ويقرأ `''` قيمةً حاضرةً خاوية.
          street: dto.street || null,
          buildingNumber: dto.buildingNumber || null,
          district: dto.district || null,
          city: dto.city || null,
          postalCode: dto.postalCode || null,
          creditLimit: dto.creditLimit ?? 0,
        } as unknown as Prisma.CustomerCreateInput,
      });
    });
  }

  update(companyId: string, id: string, dto: UpdateCustomerDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      await this.assertNoDuplicate(tx, dto.name, dto.vatNumber, id, dto.allowSameName === true);

      const data: Prisma.CustomerUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      // ②A1: الصفةُ تُعلَن أو تُغيَّر — ولا تعود «غيرَ معلَنة» (الـDTO لا يقبلها)؛ والمعرّفُ البديل يُكتب زوجاً أو يُمسح زوجاً.
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.otherIdScheme !== undefined || dto.otherId !== undefined) {
        const cleared = [dto.otherIdScheme, dto.otherId].some((v) => v === null || v === '');
        const pair = otherIdPair(dto.otherIdScheme ?? existing.otherIdScheme, dto.otherId ?? existing.otherId, { clear: cleared });
        data.otherIdScheme = pair?.scheme ?? null;
        data.otherId = pair?.id ?? null;
      }
      if (dto.country !== undefined) data.country = dto.country.trim() || 'SA';
      if (dto.vatNumber !== undefined) data.vatNumber = dto.vatNumber || null;
      assertCountryVatConsistent(dto.country ?? existing.country, dto.vatNumber !== undefined ? dto.vatNumber : existing.vatNumber);
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.street !== undefined) data.street = dto.street || null;
      if (dto.buildingNumber !== undefined) data.buildingNumber = dto.buildingNumber || null;
      if (dto.district !== undefined) data.district = dto.district || null;
      if (dto.city !== undefined) data.city = dto.city || null;
      if (dto.postalCode !== undefined) data.postalCode = dto.postalCode || null;
      if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;

      const updated = await tx.customer.update({ where: { id }, data });
      // **اسمُ العقد وهاتفُه مشتقّان من العميل** (`ق-١٠٢٨`/①⑥): يُحدَّثان في المعاملة نفسِها على كلِّ
      // عقدٍ يحمل معرّفَه — فالعميلُ مصدرُ الحقيقة والحقلُ ذاكرةٌ مشتقّة، لا لقطةٌ تشيخ ولا هجرةٌ تكتبها.
      if (dto.name !== undefined || dto.phone !== undefined) {
        await tx.contract.updateMany({ where: { customerId: id }, data: { tenant: updated.name, phone: updated.phone } });
      }
      return updated;
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      return tx.customer.update({ where: { id }, data: { archived } });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: حذفُ العميل يُمنع بفواتيره في أيّ فرع —
   * فالعميلُ كيانُ منشأة، وفاتورةٌ في فرعٍ لا يراه القارئ تبقى مانعاً لا
   * يُتجاوَز.
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.customer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.customer_not_found);
      // Checked explicitly rather than by catching a foreign-key error: a soft
      // delete never touches the FK, so the database can no longer be the one
      // refusing this. Same rule (CLAUDE.md 6.4), enforced where it's visible.
      const invoiceCount = await tx.invoice.count({ where: { customerId: id } });
      if (invoiceCount > 0) throw new ConflictException(MSG.customer_has_invoices);
      // والعقودُ كذلك — **بأيّ حالةٍ ولو مُلغاة** (`ق-١٠٢٨`/④): قيودُ الملغى منسوبةٌ إليه، و`Restrict`
      // على `Contract.customer` يجعل محوَه النهائيَّ يفشل بصمت فيبقى في السلة إلى الأبد مربوطاً
      // بعقودٍ لا تراه. والرسالةُ تسمّي المخرج: الأرشفةُ لا الحذف.
      const contractCount = await tx.contract.count({ where: { customerId: id } });
      if (contractCount > 0) throw new ConflictException(MSG.customer_has_contracts);

      // Soft delete — recoverable from the trash for 30 days.
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /**
   * **حالةُ الموافقة التسويقية وسِجلُّها** (`ق-١٣٠٣` · ك/⑰A1).
   *
   * **الحالةُ مشتقّةٌ لا مخزَّنة** — تُحسب بالبوّابة وحدَها (`marketingState`)، **والسجلُّ يُعرض
   * كاملاً**: اللائحةُ (م٢٨/٣) توجب الاحتفاظ بالإثبات، **وإثباتٌ لا يُقرأ ليس إثباتاً**.
   */
  marketingConsent(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id }, select: { id: true } });
      if (!customer) throw new NotFoundException(MSG.customer_not_found);
      const events = await tx.marketingConsent.findMany({ where: { customerId: id }, orderBy: [{ at: 'desc' }, { createdAt: 'desc' }] });
      return { customerId: id, channels: marketingState(events), events };
    });
  }

  /**
   * **تسجيلُ واقعةٍ — موافقةً أو رجوعاً عنها** (`ق-١٣٠٣` · ك/⑰A1).
   *
   * ثلاثةُ أحكامٍ في موضعٍ واحد:
   * ① **لا تاريخَ من المستقبل**: واقعةٌ تُسجَّل بعد وقوعها؛ وتاريخٌ لاحق **يفعّل موافقةً في وقتها**
   *   بلا أن يقع شيء — وهو ما يجعل الإثباتَ دعوى.
   * ② **ولا واقعةَ لا تغيّر شيئاً**: موافقةٌ فوق موافقةٍ سارية تُضخّم السجلَّ ولا تُثبت جديداً،
   *   **والرجوعُ فوق رجوعٍ كذلك**. تُردّ `409` مسمّىً.
   * ③ **والمسجِّلُ يُختم مع الواقعة** — فالإثباتُ بلا مسجِّلٍ دعوى (م٢٨/٢: توثيقٌ يقبل التحقّق).
   *
   * ⚠️ **والصفُّ لا يُعدَّل ولا يُحذف بعدها** — مُشغِّلاتٌ في القاعدة لا فحصٌ هنا: `deleteMany`
   * والـ`DELETE` الخام لا يمرّان بهذه الدالّة.
   */
  recordMarketingConsent(tenant: TenantContext, id: string, dto: RecordMarketingConsentDto) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id }, select: { id: true } });
      if (!customer) throw new NotFoundException(MSG.customer_not_found);

      const at = dto.at ? new Date(dto.at) : new Date();
      if (at.getTime() > Date.now()) throw new BadRequestException(MSG.consent_future_date);

      const channel = dto.channel as MarketingChannel;
      const events = await tx.marketingConsent.findMany({ where: { customerId: id, channel }, select: { channel: true, granted: true, at: true, createdAt: true } });
      if (mayReceiveMarketing(events, channel).allowed === dto.granted) throw new ConflictException(MSG.consent_unchanged);

      return tx.marketingConsent.create({
        data: {
          customerId: id,
          channel,
          granted: dto.granted,
          source: dto.source,
          note: dto.note?.trim() || null,
          at,
          actorType: tenant.actorType,
          actorId: tenant.profileId ?? null,
        } as unknown as Prisma.MarketingConsentCreateInput,
      });
    });
  }

  /**
   * **الرقمُ الضريبي فريدٌ قيداً، والاسمُ فريدٌ تنبيهاً** (`ق-١٠٢٨`/⑤): كانت فرادةُ الاسم قيداً في
   * القاعدة والخدمة لأن العقدَ كان يُنشئ عميلَه بالاسم فيمنع التكرارَ الضمنيّ — وقد زال بالربط
   * الصريح، فبقي ضررُها وحدَه: شخصان حقيقيان بالاسم نفسِه لا يكونان عميلين. فصار الاسمُ المطابق
   * (حيّاً أو في السلة) `409` مسمّىً «أهو نفسُه؟» **حتى يُؤكَّد** بـ`allowSameName`؛ والرقمُ الضريبي
   * يبقى مانعاً — حيّاً كان صاحبُه أو في السلة (`§6.12`: يُقرأ المحذوفُ ناعماً صراحةً).
   * ⛔ ولا تمييزَ بالهاتف — يُشارَك ويتغيّر، مفتاحٌ ضعيفٌ آخر.
   */
  private async assertNoDuplicate(tx: Prisma.TransactionClient, name?: string, vatNumber?: string, excludeId?: string, allowSameName = false): Promise<void> {
    if (!name && !vatNumber) return;
    const notSelf = excludeId ? { id: { not: excludeId } } : {};
    if (vatNumber) {
      const live = await tx.customer.findFirst({ where: { vatNumber, ...notSelf }, select: { id: true } });
      if (live) throw new ConflictException('يوجد عميل بنفس الرقم الضريبي بالفعل');
      await assertCustomerNotInTrash(tx, undefined, vatNumber, excludeId);
    }
    if (name && !allowSameName) {
      const live = await tx.customer.findFirst({ where: { name, ...notSelf }, select: { id: true } });
      if (live) throw new ConflictException(MSG.customer_same_name_exists);
      const trashed = await tx.customer.findFirst({ where: { name, deletedAt: { not: null }, ...notSelf }, select: { id: true } });
      if (trashed) throw new ConflictException(MSG.customer_same_name_in_trash);
    }
  }
}
