import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { AuditService } from '../audit/audit.service';
import { movementSources } from '../companies/company-movement.service';
import { MSG } from '../common/i18n/messages';
import { REOPEN_WINDOW_DAYS } from '../common/tenant/reopen-window';
import { ARCHIVE_PREFIX, FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { delegateName } from './export-scope';
import { ExportService } from './export.service';

/**
 * نسخةُ الإغلاق الكاملة (`ق-٥٥٤`): **لا يُمحى شيءٌ قبل أن ينال صاحبُه نسختَه**.
 *
 * - **تُنتَج ولا يُخيَّر فيها — ويُخيَّر في تنزيلها**: تُبنى عند الموافقة قبل أيّ إغلاق،
 *   ومن لقطة التصدير المطابَقة نفسِها (`ExportService.snapshot`) — فلا حزمتان تتباعدان.
 * - **ملفّاتٌ سنوية** (مقترحُ صاحب المشروع): المستنداتُ وسطورُها بسنة تاريخها، فالمحوُ يصير
 *   بالتدرّج والسنةُ وحدةٌ محاسبيةٌ حقيقية؛ وبياناتُ التهيئة (عملاء · أصناف · حسابات…) في
 *   ملفٍّ أساسيّ مشترك.
 * - **المختومُ كما هو**: كلُّ فاتورةٍ تحمل `zatcaSignedXml` تُكتب ملفَّ XML مستقلاً بلا مسّ.
 * - حقٌّ منصوصٌ مرّتين: «بصيغة إلكترونية شائعة الاستخدام» (لائحةُ حماية البيانات م٦/٢)،
 *   و«تصديرُ الفواتير الإلكترونية إلى أنظمة أرشفة خارجية» متطلَّبٌ في الحلّ التقنيّ
 *   (قرارُ الضوابط · الملحق ١).
 *
 * **أيُّ الجداول سنويّ؟ — مشتقٌّ لا معدود** (`ق-٥٤٥`): نماذجُ معيار الحركة (`ق-٥٤٦`) وكلُّ
 * نموذجٍ يشير إليها بعلاقةٍ مفردة (سطورُ الفاتورة والقيد، أقساطُ العقد، مدفوعاتُ الوردية…)؛
 * والسنةُ من أوّل حقلِ تاريخٍ يملكه النموذج بترتيب `YEAR_FIELDS`، مقروءاً من `DMMF`.
 *
 * **أحكامُ المالك على موجزها** (`ق-٥٥٨`):
 * - **الأصلُ يتكرّر في كلِّ سنةٍ يقع فيها تابعٌ له** — فالغرضُ ملفُّ سنةٍ يُسلَّم للهيئة، وعقدٌ
 *   مُشارٌ إليه غيرُ حاضرٍ نقصٌ لا حجم (العقودُ بحكمه، والقاعدةُ نفسُها لكلِّ أصلٍ يُشار إليه).
 * - **الحزمةُ مقروءةٌ آلياً، ولا عرضَ بشريٌّ للجداول**: `JSON` هي «الصيغةُ الشائعة» و`XML`
 *   ما تطلبه الهيئة — وتحويلٌ ثالثٌ قد يُخفي حقلاً؛ حدٌّ معلَنٌ في `README`.
 * - **وتُتاح ما دمنا نحفظ** — مدّةُ الإتاحة = مدّةُ الحفظ (`retainUntil`)؛ وبلا حركةٍ التسعون
 *   هي الأجل ثم الحذفُ الصلب.
 */
/** نافذةُ النسخة **للمنشأة بلا حركة** فقط (`ق-٥٥٨/ج`): لا التزامَ حفظٍ عليها، فبعدها الحذفُ الصلب. */
export const ARCHIVE_WINDOW_DAYS = REOPEN_WINDOW_DAYS;

/** دورةُ النسخ الاحتياطية على المنشور — مقيسة (`ق-٥٦٠`): يكتمل الإتلافُ بعد دورانها. */
export const BACKUP_CYCLE_DAYS = 14;

/** حقولُ التاريخ التي تحدّد سنةَ الصفّ — بترتيب الأولوية، وتُقرأ أسماؤها من `DMMF` كلِّ نموذج. */
export const YEAR_FIELDS = ['issueDate', 'date', 'occurredAt', 'start', 'openedAt', 'dueDate', 'createdAt'] as const;

export interface ArchiveFile {
  name: string;
  key: string;
  bytes: number;
  contentType: string;
  sha256: string;
}

export interface ArchiveManifest {
  version: 1;
  producedAt: string;
  expiresAt: string;
  reason: 'CLOSURE';
  company: { id: string; orgName: string; legalName: string | null; vatNumber: string | null; crNumber: string | null };
  years: number[];
  tables: number;
  totalRows: number;
  yearly: string[];
  master: string[];
  stampedInvoices: number;
  files: ArchiveFile[];
  notes: Record<string, string>;
}

/** النماذجُ التي تُقسَّم سنوياً: معيارُ الحركة + ما يشير إليها بعلاقةٍ مفردة — مشتقٌّ من `DMMF`. */
export function yearlyModels(): Set<string> {
  const movement = new Set<string>(movementSources().map((s) => s.model));
  const result = new Set<string>(movement);
  for (const m of Prisma.dmmf.datamodel.models) {
    if (m.fields.some((f) => f.kind === 'object' && !f.isList && movement.has(f.type))) result.add(m.name);
  }
  return result;
}

/** أوّلُ حقلِ تاريخٍ يملكه النموذج بترتيب الأولوية — أو `null` فيذهب إلى الملفّ الأساسيّ. */
export function yearFieldOf(model: string): string | null {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  if (!m) return null;
  const dates = new Set(m.fields.filter((f) => f.type === 'DateTime').map((f) => f.name));
  return YEAR_FIELDS.find((f) => dates.has(f)) ?? null;
}

/** روابطُ التابع بأصله بين النماذج السنوية — مشتقّةٌ من `DMMF`: علاقةٌ مفردة ومفتاحُها العدديّ. */
export interface ParentLink {
  childDelegate: string;
  parentDelegate: string;
  fk: string;
}

export function parentLinks(): ParentLink[] {
  const yearly = yearlyModels();
  const links: ParentLink[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    if (!yearly.has(m.name)) continue;
    for (const f of m.fields) {
      if (f.kind !== 'object' || f.isList || !yearly.has(f.type) || f.type === m.name) continue;
      const fk = f.relationFromFields?.[0];
      if (fk) links.push({ childDelegate: delegateName(m.name), parentDelegate: delegateName(f.type), fk });
    }
  }
  return links;
}

/**
 * الأصلُ يُكرَّر في كلِّ سنةٍ يقع فيها تابعٌ له (`ق-٥٥٨/أ`): عقدٌ بدأ في 2024 وله قسطٌ في 2026
 * يظهر في ملفّ 2026 أيضاً — فيكتمل الملفُّ بذاته. تُعيد عددَ ما كُرِّر، ولا تُكرّر ما هو حاضر.
 */
export function repeatParentsIntoChildYears(years: Record<number, Record<string, unknown[]>>, links: ParentLink[]): number {
  const byId = new Map<string, unknown>();
  for (const table of Object.values(years)) {
    for (const link of links) for (const row of table[link.parentDelegate] ?? []) byId.set(`${link.parentDelegate}:${String((row as { id?: unknown }).id)}`, row);
  }
  let repeated = 0;
  for (const [yearKey, table] of Object.entries(years)) {
    const year = Number(yearKey);
    for (const link of links) {
      const present = new Set((table[link.parentDelegate] ?? []).map((r) => String((r as { id?: unknown }).id)));
      for (const child of table[link.childDelegate] ?? []) {
        const parentId = (child as Record<string, unknown>)[link.fk];
        if (parentId == null || present.has(String(parentId))) continue;
        const parent = byId.get(`${link.parentDelegate}:${String(parentId)}`);
        if (!parent) continue;
        (years[year][link.parentDelegate] ??= []).push(parent);
        present.add(String(parentId));
        repeated += 1;
      }
    }
  }
  return repeated;
}

const yearOf = (value: unknown): number | null => {
  const d = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.getUTCFullYear() : null;
};

const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const safeName = (s: string) => s.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 80) || 'invoice';

@Injectable()
export class CompanyArchiveService {
  private readonly logger = new Logger(CompanyArchiveService.name);

  constructor(
    private readonly exportService: ExportService,
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * تُنتِج النسخةَ وترفعها — **وتسقط كلُّها إن سقط الرفع**: نسخةٌ ناقصة تبدو كاملة أسوأ من
   * غيابها، والإغلاقُ لا يقع إلا بعد عودة هذه الدالة (`ق-٥٥٤`).
   */
  async produce(companyId: string, decider: { id: string; username: string }, expiresAt: Date): Promise<ArchiveManifest> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, orgName: true, legalName: true, vatNumber: true, crNumber: true },
    });
    const snapshot = await this.exportService.snapshot(companyId);
    const producedAt = new Date();
    const prefix = `${ARCHIVE_PREFIX}${companyId}/${producedAt.toISOString().replace(/[:.]/g, '-')}/`;

    // ① التقسيم: سنويٌّ بتاريخه، أو أساسيّ.
    const modelByDelegate = new Map(Prisma.dmmf.datamodel.models.map((m) => [delegateName(m.name), m.name]));
    const yearly = yearlyModels();
    const years: Record<number, Record<string, unknown[]>> = {};
    const master: Record<string, unknown[]> = {};
    const yearlyDelegates: string[] = [];
    const masterDelegates: string[] = [];
    for (const [delegate, rows] of Object.entries(snapshot.data)) {
      const model = modelByDelegate.get(delegate) ?? '';
      const field = yearly.has(model) ? yearFieldOf(model) : null;
      if (!field) {
        master[delegate] = rows;
        masterDelegates.push(delegate);
        continue;
      }
      yearlyDelegates.push(delegate);
      for (const row of rows) {
        const y = yearOf((row as Record<string, unknown>)[field]) ?? 0;
        (years[y] ??= {})[delegate] ??= [];
        years[y][delegate].push(row);
      }
    }

    // ①ب الأصلُ يُكرَّر في سنوات توابعه — فكلُّ ملفِّ سنةٍ مكتملٌ بذاته (`ق-٥٥٨/أ`).
    const repeated = repeatParentsIntoChildYears(years, parentLinks());

    // ② الملفّات — كلُّ واحدٍ ببصمته.
    const bodies: { name: string; body: Buffer; contentType: string }[] = [];
    bodies.push({ name: 'master-data.json.gz', body: gzipSync(Buffer.from(JSON.stringify(master), 'utf8')), contentType: 'application/gzip' });
    const yearList = Object.keys(years).map(Number).sort((a, b) => a - b);
    for (const y of yearList) {
      bodies.push({ name: `years/${y}.json.gz`, body: gzipSync(Buffer.from(JSON.stringify(years[y]), 'utf8')), contentType: 'application/gzip' });
    }
    // المختومُ كما هو — ملفُّ XML لكلّ فاتورةٍ ختمتها الهيئة، بلا مسّ.
    let stampedInvoices = 0;
    for (const row of (snapshot.data.invoice ?? []) as { no?: string; issueDate?: unknown; zatcaSignedXml?: string | null }[]) {
      if (!row.zatcaSignedXml) continue;
      stampedInvoices += 1;
      const y = yearOf(row.issueDate) ?? 0;
      bodies.push({ name: `years/${y}/invoices-xml/${safeName(String(row.no ?? stampedInvoices))}.xml`, body: Buffer.from(row.zatcaSignedXml, 'utf8'), contentType: 'application/xml' });
    }

    const files: ArchiveFile[] = bodies.map((b) => ({ name: b.name, key: prefix + b.name, bytes: b.body.byteLength, contentType: b.contentType, sha256: sha256(b.body) }));
    const notes: Record<string, string> = {
      ...ExportService.notes,
      الصيغة: 'الحزمةُ مقروءةٌ آلياً (JSON مضغوط، والمختومُ XML كما هو) — ولا عرضَ بشريٌّ للجداول: تحويلٌ ثالثٌ قد يُخفي حقلاً.',
      'تكرارُ الأصول': `الأصلُ (كالعقد) يُكرَّر في كلِّ سنةٍ يقع فيها تابعٌ له — فكلُّ ملفِّ سنةٍ مكتملٌ بذاته (${repeated} تكراراً هنا).`,
      الإتلاف: `يكتمل الإتلافُ خلال ${BACKUP_CYCLE_DAYS} يوماً من دوران النسخ الاحتياطية — فالمقلبُ لا يُمحى منه صفٌّ انتقائياً.`,
      'نافذةُ إعادة الفتح': `طلبُ إعادة الفتح يُقبل ${REOPEN_WINDOW_DAYS} يوماً من الإغلاق — وبعدها تُمحى بياناتُك غيرُ الملزِمة (الهواتفُ وبياناتُ التواصل) آلياً ويبقى الملزِم إلى أجله؛ ويمكنك طلبُ محوها قبل ذلك، ولا عودةَ بعد المحو.`,
    };
    const manifest: ArchiveManifest = {
      version: 1,
      producedAt: producedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason: 'CLOSURE',
      company,
      years: yearList,
      tables: snapshot.manifest.tables,
      totalRows: snapshot.manifest.totalRows,
      yearly: yearlyDelegates.sort(),
      master: masterDelegates.sort(),
      stampedInvoices,
      files,
      notes,
    };
    const readme = this.readme(manifest);
    const readmeFile = { name: 'README.md', body: Buffer.from(readme, 'utf8'), contentType: 'text/markdown; charset=utf-8' };
    const manifestFile = { name: 'manifest.json', body: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), contentType: 'application/json' };
    manifest.files.push(
      { name: readmeFile.name, key: prefix + readmeFile.name, bytes: readmeFile.body.byteLength, contentType: readmeFile.contentType, sha256: sha256(readmeFile.body) },
      { name: manifestFile.name, key: prefix + manifestFile.name, bytes: manifestFile.body.byteLength, contentType: manifestFile.contentType, sha256: sha256(manifestFile.body) },
    );

    // ③ الرفع — وأيُّ سقوطٍ يسقط النسخةَ كلَّها، فلا إغلاقَ بعده.
    try {
      for (const b of [...bodies, readmeFile, manifestFile]) await this.files.putObject(prefix + b.name, b.body, b.contentType);
    } catch (e) {
      this.logger.error(`تعذّر رفع نسخة الإغلاق للمنشأة ${companyId}: ${String(e)}`);
      throw new ServiceUnavailableException(MSG.archive_storage_unavailable);
    }

    // أثرُ التدقيق: من أنتج النسخةَ ومتى وكم — والفشلُ فيه لا يُسقط النسخة.
    await this.audit
      .record({
        companyId,
        actorType: 'PLATFORM_ADMIN',
        actorId: decider.id,
        actorName: decider.username,
        screen: 'export',
        action: 'archive',
        entity: 'CompanyData',
        entityId: companyId,
        method: 'POST',
        path: '/admin/deletion-requests/:id/approve',
        details: { files: manifest.files.length, years: yearList, rows: manifest.totalRows, stampedInvoices },
        ip: null,
      })
      .catch((e) => this.logger.error(`تعذّر تسجيل حدث النسخة: ${String(e)}`));

    return manifest;
  }

  /** روابطُ تنزيلٍ موقَّعةٌ قصيرةُ العمر لملفّات النسخة — ما دام الأجلُ لم ينقضِ. */
  async links(manifest: ArchiveManifest): Promise<{ name: string; bytes: number; sha256: string; url: string; expiresInSeconds: number }[]> {
    return Promise.all(
      manifest.files.map(async (f) => {
        const { url, expiresInSeconds } = await this.files.archiveUrl(f.key);
        return { name: f.name, bytes: f.bytes, sha256: f.sha256, url, expiresInSeconds };
      }),
    );
  }

  /** `README.md` — مقروءٌ للإنسان: ما في النسخة وكيف تُقرأ وحتى متى تُتاح. */
  private readme(m: ArchiveManifest): string {
    const lines = [
      `# نسخةُ بيانات المنشأة — ${m.company.orgName}`,
      '',
      `أُنتجت في ${m.producedAt.slice(0, 10)} عند إغلاق الحساب بطلبك، وتُتاح للتنزيل ما دمنا نحفظ بياناتك — حتى ${m.expiresAt.slice(0, 10)} على الأقلّ.`,
      '',
      '## ما في النسخة',
      '',
      `- **${m.years.length} ملفّاً سنوياً** (\`years/السنة.json.gz\`): المستنداتُ وسطورُها بسنة تاريخها — ${m.yearly.join(' · ')}.`,
      `- **ملفٌّ أساسيّ** (\`master-data.json.gz\`): بياناتُ التهيئة المشتركة — ${m.master.join(' · ')}.`,
      `- **${m.stampedInvoices} فاتورةً ختمتها الهيئة** (\`years/السنة/invoices-xml/رقم.xml\`): الـXML الموقَّع **كما هو** بلا مسّ.`,
      `- \`manifest.json\`: كلُّ ملفٍّ بحجمه وبصمته (SHA-256) — فتتحقّق من سلامة ما نزّلته.`,
      '',
      `الجداولُ ${m.tables} · الصفوفُ ${m.totalRows} · الجداولُ في كلِّ ملفٍّ مفاتيحُ JSON باسم النموذج، وكلُّ صفٍّ كما هو في القاعدة (UTF-8، مضغوطٌ gzip).`,
      '',
      '## حدودٌ تُقال هنا لا تُكتشف',
      '',
      ...Object.entries(m.notes).map(([k, v]) => `- **${k}**: ${v}`),
      '- **العقدُ العابرُ للسنوات** يظهر في ملفّ كلِّ سنةٍ له فيها قسطٌ أو دفعة — فكلُّ ملفِّ سنةٍ مكتملٌ بذاته.',
      '- **لا عرضَ بشريٌّ للجداول** (CSV/XLSX): الحزمةُ مقروءةٌ آلياً، والتحويلُ الثالث قد يُخفي حقلاً.',
      `- **وحين يُمحى** — يكتمل الإتلافُ خلال ${BACKUP_CYCLE_DAYS} يوماً من دوران النسخ الاحتياطية.`,
      '',
      '## سندُها',
      '',
      '- حقُّك في نسخةٍ من بياناتك «بصيغة إلكترونية شائعة الاستخدام» — اللائحةُ التنفيذية لنظام حماية البيانات الشخصية، المادة ٦/٢.',
      '- تصديرُ الفواتير الإلكترونية إلى أنظمة أرشفة خارجية — قرارُ الضوابط والمتطلبات للفوترة الإلكترونية، الملحق (١).',
      '- **والتزامُ الحفظ النظاميّ يبقى على المنشأة** (لائحةُ ضريبة القيمة المضافة م٦٦، ولائحةُ الزكاة م١١٠، ونظامُ الدفاتر التجارية م٨) — فهذه النسخةُ تُمكّنك منه ولا تنقله.',
      '',
    ];
    return lines.join('\n');
  }
}
