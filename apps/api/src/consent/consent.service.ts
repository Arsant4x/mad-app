import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';

/**
 * ═══ موافقةُ التاجر على المعالجين الفرعيين (`ق-٥٨١` · `ق-٥٨٩`) ═══
 *
 * اللائحةُ التنفيذية **م١٧/٥/ج** توجب **الموافقة المسبقة من جهة التحكم** قبل التعاقد مع
 * معالجٍ فرعيّ، **وجهةُ التحكم هي التاجر لا نحن**. ومن خالف تعليماتِ جهة التحكم **يُعدّ في
 * حكمها** (م١٧/٤) — **فالإنفاذُ التقنيُّ هو ما يُبقينا معالجاً**.
 *
 * ⭐ **والحكمُ «اختيارٌ لا حجب»**: ليس «يُمنع حتى يوافق» بل **«الخدمةُ صارت تقتضي هذا —
 * فاقبل، أو خذ بياناتك واخرج»**. **والفرقُ ليس في الشاشة بل في أن أمامه بابَين لا باباً.**
 *
 * وأربعةٌ تجعله مقبولاً — **وكلُّها مبنيّةٌ هنا لا موصوفة**:
 *   ① **مهلةٌ ثلاثون يوماً على الأقلّ** (`NOTICE_DAYS`) — والنشرُ بمهلةٍ أقصر **يُرفض**.
 *   ② **تذكيرٌ متكرّرٌ لا إشعارٌ واحد** (`remind`) — عند النشر، وقبل السريان بأربعةَ عشرَ
 *      يوماً وبسبعةٍ وبيومٍ واحد، **وبعد السريان أسبوعياً ما دام ممنوعاً**.
 *   ③ **الشاشةُ ثلاثةُ أزرار** — في الواجهة، وهذا يغذّيها بما تعرضه.
 *   ④ **منفذُ الخروج لا يُغلق** — `@AllowWhileConsentPending` على التصدير والإغلاق.
 *
 * ⚠️ **والموافقةُ على نصٍّ ثابت**: النسخةُ تحمل **لقطةَ القائمة** وقتَ نشرها — فلو قُبلت
 * «القائمة» لصار تعديلُ صفٍّ فيها تغييراً لِما وُوفق عليه **بلا موافقةٍ جديدة**.
 *
 * 🔬 **وفراغٌ معلَن** (`ق-٥٩١`): أيُعدّ السكوتُ بعد المهلة موافقةً «مسبقة»؟ **لم يوجد نصٌّ
 * يحسمه** — فبُني الأشدّ، ويُلطَّف إن جاء الجواب.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);
  /** صورةٌ قصيرةُ العمر من «النسخة السارية» — تتغيّر مرّاتٍ في العمر، وتُقرأ في كلِّ طلب. */
  private cached: { at: number; version: number | null; effectiveFrom: Date | null } = { at: 0, version: null, effectiveFrom: null };

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** المهلةُ الدنيا بين النشر والسريان (`ق-٥٨٩/①`) — **تُرفض دونها**. */
  static readonly NOTICE_DAYS = 30;
  /** كم يبقى صالحاً صورةُ النسخة السارية قبل أن تُقرأ من القاعدة ثانيةً. */
  static readonly CACHE_MS = 60_000;

  // ---------- ما تقرؤه البوّابة ----------

  /**
   * النسخةُ السارية — **أحدثُ نسخةٍ حلَّ تاريخُ سريانها**. تُقرأ بصورةٍ قصيرة العمر لأن
   * حارسَ المستأجر يسألها في **كلِّ طلب**، وهي تتغيّر مرّاتٍ في السنة.
   */
  async effectiveVersion(now: Date = new Date()): Promise<{ version: number | null; effectiveFrom: Date | null }> {
    if (Date.now() - this.cached.at < ConsentService.CACHE_MS) return { version: this.cached.version, effectiveFrom: this.cached.effectiveFrom };
    const row = await this.prisma.subProcessorListVersion.findFirst({
      where: { effectiveFrom: { lte: now } },
      orderBy: { version: 'desc' },
      select: { version: true, effectiveFrom: true },
    });
    this.cached = { at: Date.now(), version: row?.version ?? null, effectiveFrom: row?.effectiveFrom ?? null };
    return { version: this.cached.version, effectiveFrom: this.cached.effectiveFrom };
  }

  /** تُبطِل الصورة — يُستدعى عند النشر وفي الاختبارات، فلا يُنتظَر دقيقة. */
  invalidate(): void {
    this.cached = { at: 0, version: null, effectiveFrom: null };
  }

  // ---------- جانبُ التاجر ----------

  /**
   * ما يعرضه للتاجر: النسخةُ السارية ونصُّها، وهل هو ممنوعٌ حتى يقبل.
   * **ويعمل وهو ممنوع** — وإلا كانت بوّابةً لا يُقرأ سببُها.
   */
  async forCompany(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { consentedListVersion: true } });
    const { version, effectiveFrom } = await this.effectiveVersion();
    const current = version === null ? null : await this.prisma.subProcessorListVersion.findUnique({ where: { version } });
    const upcoming = await this.prisma.subProcessorListVersion.findFirst({ where: { effectiveFrom: { gt: new Date() } }, orderBy: { version: 'desc' } });
    return {
      requiredVersion: version,
      acceptedVersion: company.consentedListVersion,
      /// ممنوعٌ إذا سرت نسخةٌ ولم يقبلها — **ولا يُمنع قبل السريان**.
      blocked: version !== null && company.consentedListVersion !== version,
      effectiveFrom,
      noticeDays: ConsentService.NOTICE_DAYS,
      current: current && { version: current.version, publishedAt: current.publishedAt, effectiveFrom: current.effectiveFrom, summary: current.summary, entries: current.entries },
      upcoming: upcoming && { version: upcoming.version, publishedAt: upcoming.publishedAt, effectiveFrom: upcoming.effectiveFrom, summary: upcoming.summary, entries: upcoming.entries },
    };
  }

  /**
   * القبول — **صفٌّ يُثبت**: من قبِل ومتى ومن أيّ عنوان. والصورةُ على المنشأة تُكتب
   * **في المعاملة نفسِها** (`ق-٥٨٩`)، فلا تفترق عن أصلها.
   */
  async accept(companyId: string, actorType: string, version: number, actor: { id: string; username: string }, ip: string | null) {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.consent_owner_only);
    const target = await this.prisma.subProcessorListVersion.findUnique({ where: { version } });
    if (!target) throw new NotFoundException(MSG.consent_version_not_found);
    if (target.effectiveFrom > new Date()) {
      throw new ConflictException(formatMessage(MSG.consent_not_effective_yet, { effectiveFrom: target.effectiveFrom.toISOString().slice(0, 10) }));
    }
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { consentedListVersion: true } });
    if (company.consentedListVersion === version) throw new ConflictException(MSG.consent_already_accepted);

    // ⚠️ **تحت سياق المنشأة**: جدولُ القبول تحت `FORCE` — فكتابةٌ بلا سياقٍ تردّها السياسةُ
    //    لا تمرّ صامتة. والصورةُ على `companies` (بلا عزل) **في المعاملة نفسِها**.
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await tx.processingAgreementAcceptance.create({
        data: { companyId, version, acceptedById: actor.id, acceptedByName: actor.username, ip } as unknown as Prisma.ProcessingAgreementAcceptanceUncheckedCreateInput,
      });
      await tx.company.update({ where: { id: companyId }, data: { consentedListVersion: version } });
    });
    this.logger.warn(`Company ${companyId} accepted sub-processor list v${version} (${actor.username})`);
    return this.forCompany(companyId);
  }

  // ---------- جانبُ المنصّة ----------

  listSubProcessors() {
    return this.prisma.subProcessor.findMany({ orderBy: [{ removedAt: 'asc' }, { addedAt: 'asc' }] });
  }

  listVersions() {
    return this.prisma.subProcessorListVersion.findMany({ orderBy: { version: 'desc' } });
  }

  /**
   * كم منشأةً تقف اليوم على كلِّ نسخة — ما يقرؤه الدعمُ قبل أن يسأل «لماذا مُنع فلان؟».
   *
   * ⚠️ **يُقرأ من `companies` لا من جدول القبول**: ذاك تحت `FORCE`، **وقراءةٌ عابرةٌ
   * للمستأجرين بلا سياقٍ تعود صفراً بلا خطأ** (`ق-٢٦٢`) — فيُقرأ ما لا عزلَ عليه.
   * **وحدُّه معلَن**: يعدّ **الحالَ** لا التاريخ — من قبِل نسخةً ثم أحدثَ يُحسب على الأحدث.
   */
  async acceptanceCounts() {
    const rows = await this.prisma.company.groupBy({ by: ['consentedListVersion'], _count: { _all: true } });
    return Object.fromEntries(rows.filter((r) => r.consentedListVersion !== null).map((r) => [r.consentedListVersion as number, r._count._all]));
  }

  upsertSubProcessor(input: { id?: string; name: string; purpose: string; location: string; dataCategories: string[] }) {
    return input.id
      ? this.prisma.subProcessor.update({ where: { id: input.id }, data: { name: input.name, purpose: input.purpose, location: input.location, dataCategories: input.dataCategories } })
      : this.prisma.subProcessor.create({ data: { name: input.name, purpose: input.purpose, location: input.location, dataCategories: input.dataCategories } });
  }

  /** يُرفع من القائمة ولا يُحذف صفُّه — فما وقعت الموافقةُ عليه يبقى مقروءاً. */
  retireSubProcessor(id: string) {
    return this.prisma.subProcessor.update({ where: { id }, data: { removedAt: new Date() } });
  }

  /**
   * نشرُ نسخةٍ جديدة — **وهي الحدثُ الذي يوجب موافقةً جديدة** (`ق-٥٨١`): إضافةُ معالجٍ
   * فرعيٍّ ليست تحريرَ صفٍّ في جدول.
   *
   * ⛔ **والمهلةُ شرطُ قبولٍ لا تنبيه**: نشرٌ بمهلةٍ أقصر من `NOTICE_DAYS` **يُرفض** —
   * فتغييرٌ يُعلَن يومَه يجعل «الاختيار» حجباً.
   */
  async publishVersion(summary: string, effectiveFrom: Date, now: Date = new Date()) {
    const minimum = new Date(now.getTime() + ConsentService.NOTICE_DAYS * 24 * 3600 * 1000);
    if (effectiveFrom < minimum) throw new BadRequestException(formatMessage(MSG.consent_notice_too_short, { days: ConsentService.NOTICE_DAYS }));

    const entries = await this.prisma.subProcessor.findMany({ where: { removedAt: null }, orderBy: { addedAt: 'asc' } });
    const last = await this.prisma.subProcessorListVersion.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;
    const created = await this.prisma.subProcessorListVersion.create({
      data: {
        version,
        summary,
        effectiveFrom,
        entries: entries.map((e) => ({ name: e.name, purpose: e.purpose, location: e.location, dataCategories: e.dataCategories })) as unknown as Prisma.InputJsonValue,
      },
    });
    this.invalidate();
    await this.notifyAll(created.version, created.effectiveFrom, 'published');
    this.logger.warn(`Published sub-processor list v${version} effective ${effectiveFrom.toISOString().slice(0, 10)} (${entries.length} entries)`);
    return created;
  }

  // ---------- ② التذكيرُ المتكرّر ----------

  /**
   * **تذكيرٌ متكرّرٌ لا إشعارٌ واحد** (`ق-٥٨٩/②`): «لم يقرأ الإشعار» علّةٌ تُعالَج بالتكرار
   * **ولا تُقبل عذراً بعد المنع**. فيُذكَّر من لم يقبل: قبل السريان بـ`14` و`7` و`1`،
   * **وبعده أسبوعياً ما دام ممنوعاً**.
   *
   * ⚠️ **والتكرارُ لا يُنتج إشعاراً مكرّراً**: مفتاحُ إبطال التكرار فريدٌ لكلِّ (منشأة ·
   * نسخة · مرحلة) — **والقيدُ الفريد في القاعدة هو الضمانة لا الشيفرة**.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: SCHEDULE_TIME_ZONE })
  async remind(now: Date = new Date()): Promise<{ stage: string; companies: number }[]> {
    const out: { stage: string; companies: number }[] = [];
    const versions = await this.prisma.subProcessorListVersion.findMany({ orderBy: { version: 'desc' }, take: 5 });
    for (const v of versions) {
      const daysLeft = Math.ceil((v.effectiveFrom.getTime() - now.getTime()) / (24 * 3600 * 1000));
      let stage: string | null = null;
      if (daysLeft === 14 || daysLeft === 7 || daysLeft === 1) stage = `t-${daysLeft}`;
      else if (daysLeft <= 0) {
        const weeks = Math.floor((now.getTime() - v.effectiveFrom.getTime()) / (7 * 24 * 3600 * 1000));
        // أسبوعياً بعد السريان — ومفتاحُ الإبطال يحمل رقمَ الأسبوع فلا يتكرّر في يومه.
        if ((now.getTime() - v.effectiveFrom.getTime()) % (7 * 24 * 3600 * 1000) < 24 * 3600 * 1000) stage = `w+${weeks}`;
      }
      if (!stage) continue;
      const count = await this.notifyAll(v.version, v.effectiveFrom, stage, now);
      if (count > 0) out.push({ stage: `v${v.version}:${stage}`, companies: count });
    }
    return out;
  }

  /**
   * يُشعر كلَّ منشأةٍ لم تقبل هذه النسخة — **والمغلقةُ والمحذوفةُ خارجَه**: من لا يصل
   * حسابَه لا يُذكَّر بقرارٍ لا يملكه.
   */
  private async notifyAll(version: number, effectiveFrom: Date, stage: string, now: Date = new Date()): Promise<number> {
    // ⚠️ **والفارغُ يُسمّى صراحةً**: `NOT { field: value }` على عمودٍ فارغٍ يُترجم إلى
    //    `NOT (col = v)` — **و`NULL` ليست «غيرَ مساوية» بل مجهولة، فتسقط من النتيجة**.
    //    فكلُّ من لم يقبل قطّ كان يخرج من التذكير — وهو من يُذكَّر أصلاً (مقيسٌ: صفرُ إشعارات).
    const companies = await this.prisma.company.findMany({
      where: {
        status: { in: ['ACTIVE', 'FROZEN', 'STOPPED'] },
        OR: [{ consentedListVersion: null }, { consentedListVersion: { not: version } }],
      },
      select: { id: true },
    });
    const day = effectiveFrom.toISOString().slice(0, 10);
    const effective = effectiveFrom <= now;
    let raised = 0;
    for (const c of companies) {
      const ok = await this.tenantPrisma.runInTenantContext(c.id, (tx) =>
        NotificationsService.raise(tx, c.id, {
          kind: 'SUBPROCESSOR_CONSENT',
          dedupeKey: `subprocessor-v${version}-${stage}`,
          title: effective ? 'قائمةُ المعالجين الفرعيين سرت — ويلزم قبولُك' : `قائمةُ المعالجين الفرعيين تتغيّر في ${day}`,
          body: effective
            ? `الخدمةُ صارت تقتضي قائمةً محدَّثة من المعالجين الفرعيين (النسخة ${version}). أمامك ثلاثةٌ: تقبل الآن، أو تنزّل بياناتك، أو تُغلق حسابك — والتصديرُ والإغلاق يعملان.`
            : `نشرنا النسخة ${version} من قائمة المعالجين الفرعيين، وتسري في ${day}. اقرأها الآن واقبلها قبل ذلك التاريخ، أو نزّل بياناتك وأغلق حسابك إن لم توافق.`,
          linkScreen: 'subscription',
        }),
      ).catch((e) => {
        this.logger.error(`تعذّر إشعارُ المنشأة ${c.id} بالنسخة ${version}: ${String(e)}`);
        return false;
      });
      if (ok) raised += 1;
    }
    return raised;
  }
}
