import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { JwtPayload } from '../auth/types';
import { MSG } from '../common/i18n/messages';
import { generateApiKey, parseApiKeyToken } from './api-key-token.util';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { IntegrationUsageService, UsageView, usagePeriod } from './integration-usage.service';

/** ما يراه التاجر في القائمة — **بلا سرٍّ ولا هاش**. */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  permissionTemplateId: string;
  permissionTemplateName: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly usageService: IntegrationUsageService,
  ) {}

  /**
   * **تحقّقٌ من رمزٍ مقدَّم** (`ق-١٢٩١` · ي/⑫A3) — يُنادى من `JwtAuthGuard` قبل أيّ سياق.
   *
   * 🔴 **ويُقرأ بمسندِ المصادقة لا بلا سياق**: الجدولُ تحت `FORCE`، **فالقراءةُ بلا
   * سياقٍ تعود فارغةً بنجاح** فيُردّ كلُّ مفتاحٍ صحيحٍ `401` — **وهو ما وقع في أوّل
   * تشغيلٍ للحزمة** (خمسُ مراحلَ حمراء)، ولم تكشفه القراءة. والمسندُ `runAsApiKeyLookup`
   * على نمط `app.platform_admin` (`ق-٦٧٥`): قراءةٌ فقط، ومسارٌ واحد، **وبالبادئة
   * الفريدة** فلا يُعيد إلا صفّاً واحداً — وكلُّ ما بعده داخل سياق منشأة المفتاح.
   */
  async authenticate(token: string): Promise<JwtPayload> {
    const parsed = parseApiKeyToken(token);
    if (!parsed) throw new UnauthorizedException(MSG.api_key_invalid);

    const key = await this.tenantPrisma.runAsApiKeyLookup((tx) => tx.apiKey.findUnique({ where: { prefix: parsed.prefix } }));
    // ⚠️ **لا فرقَ في الجواب بين مفتاحٍ لا وجود له وسرٍّ خاطئ** — وإلا صار الردُّ
    //    كاشفاً عن البادئات الموجودة.
    if (!key || key.revokedAt) throw new UnauthorizedException(MSG.api_key_invalid);

    const ok = await argon2.verify(key.secretHash, parsed.secret).catch(() => false);
    if (!ok) throw new UnauthorizedException(MSG.api_key_invalid);

    // **خارج مسار الردّ وداخل سياق منشأته**: أثرُ الاستعمال لا يُبطئ الطلبَ ولا يُسقطه.
    void this.tenantPrisma
      .runInTenantContext(key.companyId, (tx) => tx.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }))
      .catch(() => undefined);

    return {
      sub: key.id,
      actorType: 'INTEGRATION',
      companyId: key.companyId,
      profileId: key.id,
      username: key.name,
    };
  }

  /** استعمالُ التكامل وحصّتُه (`ق-١٢٩١` · ي/㉑A1) — يقرؤه المالك في شاشته. */
  async usage(companyId: string): Promise<{ quota: number | null; period: string; rows: UsageView[] }> {
    const quota = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { apiMonthlyQuota: true } }),
    );
    return { quota: quota.apiMonthlyQuota, period: usagePeriod(), rows: await this.usageService.list(companyId, quota.apiMonthlyQuota) };
  }

  list(companyId: string): Promise<ApiKeyView[]> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.apiKey.findMany({
        orderBy: [{ createdAt: 'desc' }],
        include: { permissionTemplate: { select: { name: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        permissionTemplateId: r.permissionTemplateId,
        permissionTemplateName: r.permissionTemplate.name,
        lastUsedAt: r.lastUsedAt,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
      }));
    });
  }

  /**
   * يُنشئ مفتاحاً **ويُعيد رمزَه مرّةً واحدة** — ولا سبيل لقراءته بعدها.
   *
   * والقالبُ يجب أن يكون **قالبَ هذه المنشأة أو قالباً عامّاً**: قالبُ منشأةٍ أخرى
   * لا يُرى أصلاً تحت `FORCE`، والفحصُ هنا يجعل الرفضَ مسمّىً لا خطأَ قاعدةٍ خاماً.
   */
  async create(companyId: string, dto: CreateApiKeyDto): Promise<ApiKeyView & { token: string }> {
    const generated = generateApiKey();
    const secretHash = await argon2.hash(generated.secret);
    const row = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const template = await tx.permissionTemplate.findFirst({
        where: { id: dto.permissionTemplateId, OR: [{ companyId }, { companyId: null }] },
      });
      if (!template) throw new NotFoundException(MSG.template_not_found);
      // ⛔ **ولا مفتاحَ بكلِّ الشاشات**: المفتاحُ يُسلَّم لنظامٍ خارجيّ، ونطاقُه يُضيَّق
      //    عمداً — فقالبٌ مفتوحٌ على الكلّ يُردّ باسمه لا يُقبل صامتاً.
      if (template.isAllScreens) throw new BadRequestException(MSG.api_key_template_too_wide);
      const created = await tx.apiKey.create({
        data: {
          companyId,
          name: dto.name.trim(),
          prefix: generated.prefix,
          secretHash,
          permissionTemplateId: template.id,
        },
      });
      return { created, templateName: template.name };
    });
    return {
      id: row.created.id,
      name: row.created.name,
      prefix: row.created.prefix,
      permissionTemplateId: row.created.permissionTemplateId,
      permissionTemplateName: row.templateName,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: row.created.createdAt,
      token: generated.token,
    };
  }

  /** الإبطالُ **ختمٌ لا حذف**: الصفُّ يبقى ليُقرأ أثرُه، والرمزُ يُردّ من ساعته. */
  async revoke(companyId: string, id: string): Promise<ApiKeyView> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.apiKey.findUnique({ where: { id }, include: { permissionTemplate: { select: { name: true } } } });
      if (!existing) throw new NotFoundException(MSG.api_key_not_found);
      const row = existing.revokedAt
        ? existing
        : { ...(await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })), permissionTemplate: existing.permissionTemplate };
      return {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        permissionTemplateId: row.permissionTemplateId,
        permissionTemplateName: row.permissionTemplate.name,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
        createdAt: row.createdAt,
      };
    });
  }
}
