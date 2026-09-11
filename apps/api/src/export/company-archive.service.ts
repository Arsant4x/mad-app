import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { AuditService } from '../audit/audit.service';
import { movementSources } from '../companies/company-movement.service';
import { MSG } from '../common/i18n/messages';
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
 * **حدُّه المعلَن**: العقدُ العابرُ للسنوات يُكتب بسنة بدايته، وأقساطُه ودفعاتُه بسنواتها —
 * وهو اختيارٌ معروضٌ للحكم لا مُقرّ (موجزُ `ق-٥٥٤`). والصيغةُ JSON مضغوطةً (مهيكلة) مع
 * `README` مقروء — وجدولٌ للإنسان (CSV/XLSX) معروضٌ في الموجز نفسِه.
 */
export const ARCHIVE_WINDOW_DAYS = 90;

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
    const notes = { ...ExportService.notes } as Record<string, string>;
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
      `أُنتجت في ${m.producedAt.slice(0, 10)} عند إغلاق الحساب بطلبك، وتُتاح للتنزيل حتى ${m.expiresAt.slice(0, 10)}.`,
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
      '- **العقدُ العابرُ للسنوات** يُكتب بسنة بدايته، وأقساطُه ودفعاتُه بسنواتها.',
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
