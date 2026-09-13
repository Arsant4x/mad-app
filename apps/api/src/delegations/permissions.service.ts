import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { ScreenActionMap } from '../templates/screens';
import { TenantContext } from '../auth/types';
import { Grant, TreeNode, buildTree } from './permission-tree';
import { DelegationLink, RootGrants, effectiveGrants } from './intersection';
import { rootGrantsFrom } from './root-grants';
import { SECTORS, Sector, screensFor } from '../activities/sectors';
import { ExtinguishedGrant, splitLastLink } from './extinguished';
import { DelegationRow, chainsFor } from './chain-source';

/**
 * ما يُرسَل إلى الواجهة — **الحكم محسوباً، لا موادّه**.
 *
 * ⚠️ الفرق جوهري: إرسال الصفوف الخام لتستنتج منها الواجهة **هو** النظام
 * الثاني، ولو لم يُسمَّ كذلك. فكل حقلٍ هنا نتيجةٌ لا مُدخَل.
 */
export interface MePermissions {
  /** النافذ الآن — وعليه وحده تُبنى الأزرار. */
  grants: Grant[];
  /**
   * مُنح وانطفأ، بسببه. **لا يُحذف**: بدونه يرى المفوِّض صلاحيةً «غير
   * ممنوحة» فيمنحها بلا أثر — والعطب فوقه لا عنده.
   */
  extinguished: ExtinguishedGrant[];
  /**
   * ما يجوز لهذا الفاعل تفويضه = ما يملكه هو.
   *
   * قاعدة «لا يُعرض في شجرة التفويض ما لا يملكه المفوِّض» تُنفَّذ بهذا
   * الحقل — مرشَّحاً في الخادم لا في المتصفّح.
   */
  grantable: Grant[];
  /** مسارات التفويض المنتهية عند الفاعل — للعرض الشجري. */
  chains: ChainView[];
  /** الشجرة مقصورةً على ما يملك الفاعل فيه شيئاً. */
  tree: TreeNode[];
}

export interface ChainView {
  links: { grantorId: string; granteeId: string; granted: Grant[]; revoked: boolean }[];
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /**
   * يحسب صلاحيات الفاعل **عند كل طلب**.
   *
   * ## لا ذاكرة مؤقتة — ولا حتى ثانية
   *
   * الملحق (1) من قرار هيئة الزكاة والضريبة والجمارك يجعل
   * `Absence of user session management` وظيفةً **محظورة**. وذاكرةٌ مؤقتة
   * تعني نافذةً يسري فيها تفويضٌ مسحوب: يُسحب من مشرفٍ فيبقى مرؤوسوه
   * يعملون بها حتى تنتهي المدة. فالسحب لا يسحب.
   *
   * والقياس يجعل الأمر بلا ثمن أصلاً: انظر القسم أسفل الملف.
   */
  async forActor(tenant: TenantContext): Promise<MePermissions> {
    /**
     * ⚠️ **الأنشطة تضيّق السقف قبل التفويض لا بعده.**
     *
     * القاعدة المعتمَدة: `الشاشات = اتحاد الأنشطة ∩ قالب الصلاحيات`.
     * وتضييقُ الجذر يجعل كل ما بعده يرثه تلقائياً — `grantable` والشجرة
     * والتفويض. أما الترشيح في النهاية فيترك **ما يجوز تفويضه** أوسع مما
     * يُرى: يمنح المفوِّض شاشةً لا يفتحها أحد.
     */
    const root = narrowToScreens(await this.rootFor(tenant), await this.sectorScreensFor(tenant.companyId));

    // صاحب المنشأة جذرٌ بطبعه: لا أحد يفوّضه، فلا سلسلة فوقه.
    const rows = tenant.actorType === 'COMPANY' ? [] : await this.rowsFor(tenant.companyId);
    const chains = chainsFor(rows, tenant.profileId);

    // بلا تفويض: صلاحياته قالبُه كاملاً — وهي الحالة الشائعة.
    if (chains.length === 0) {
      const all = [...root].sort();
      return { grants: all, extinguished: [], grantable: all, chains: [], tree: treeFor(root) };
    }

    // ⚠️ اتحادٌ بين المسارات وتقاطعٌ داخل كلٍّ منها: مسارٌ يمنح صلاحيةً
    // يكفي — تماماً كما لو فوّضه مديرٌ واحد بها. وتقاطعُ المسارات يُسقط
    // ما فُوّض فعلاً من أحدهما.
    const effective = new Set<Grant>();
    for (const chain of chains) for (const g of effectiveGrants(root, chain)) effective.add(g);

    // ما انطفأ في مسارٍ وسرى في آخر **ليس منطفئاً**: العرض يتبع النفاذ.
    const extinguished: ExtinguishedGrant[] = [];
    const seen = new Set<string>();
    for (const chain of chains) {
      for (const e of splitLastLink(root, chain).extinguished) {
        if (effective.has(e.grant)) continue;
        const key = `${e.grant}|${e.atIndex}|${e.grantorId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        extinguished.push(e);
      }
    }

    const grants = [...effective].sort();
    return {
      grants,
      extinguished,
      // ما يفوّضه الفاعل هو ما يملكه — نفس المجموعة، باسمٍ يقول وظيفتها.
      grantable: grants,
      chains: chains.map((links) => ({
        links: links.map((l) => ({ grantorId: l.grantorId, granteeId: l.granteeId, granted: [...l.granted].sort(), revoked: l.revoked })),
      })),
      tree: treeFor(effective),
    };
  }

  /**
   * شاشات أنشطة المنشأة — أو `null` إن كان الترشيح **مطفأً**.
   *
   * ## المفتاح: `primaryActivityId`
   *
   * `null` ⇒ **لا ترشيح إطلاقاً**. وهو الجواب على «ماذا يحدث للمنشآت
   * القائمة لحظة التطبيق؟»: كلها تستيقظ غداً وترى ما كانت تراه بالضبط،
   * لأن العمود يبدأ فارغاً. والترشيح يبدأ عند أول اختيارٍ صريح.
   *
   * ⚠️ **والاتحاد لا التقاطع** بين الأنشطة: منشأةٌ بنشاطين ترى شاشات
   * الاثنين. والتقاطع يُخفي عنها ما تعمل عليه.
   *
   * ⚠️ **والمعطَّل لا يُحتسب** — لكن بياناته تبقى: تختفي شاشته ولا يُحذف
   * صفّ. وإخفاؤها من التقارير يجعل ميزان المراجعة يكذب.
   *
   * وكل مسارٍ غامض هنا **يفتح لا يغلق**: نشاطٌ بلا قطاع، أو أنشطةٌ كلها
   * بلا قطاع ⇒ `screensFor([])` ⇒ الكل.
   */
  private async sectorScreensFor(companyId: string): Promise<Set<string> | null> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { primaryActivityId: true },
    });
    if (!company.primaryActivityId) return null;

    // ⚠️ **تحت سياق المستأجر**: `business_activities` عليه RLS ENABLE+FORCE،
    // وقراءةٌ خارجه تعود **فارغةً بنجاح** — فتصير `sectors` خاوية،
    // و`screensFor([])` تُرجع الكل، **فيتعطّل الترشيح كله بصمت**.
    const activities = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.businessActivity.findMany({ where: { disabledAt: null }, select: { sector: true } }),
    );
    const sectors = activities.map((a) => a.sector).filter((s): s is Sector => s !== null && (SECTORS as readonly string[]).includes(s));
    return screensFor(sectors);
  }

  /**
   * سقف السلسلة من القالب.
   *
   * ⚠️ يُقرأ من **نفس** الجدولين اللذين يقرأهما `tenant.guard.ts`، بنفس
   * الترتيب: قالب الموظف يَجُبّ قالب المنشأة. أي مصدرٍ ثانٍ هنا يفتح باب
   * أن يقول الحارس شيئاً وتقول هذه شيئاً آخر.
   */
  private async rootFor(tenant: TenantContext): Promise<RootGrants> {
    if (tenant.actorType === 'COMPANY_USER') {
      // تحت سياق المنشأة (`ق-٦٥٧` · المرحلة ①) — كما صار يقرأ `tenant.guard.ts` نفسُه.
      const user = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
        tx.companyUser.findUniqueOrThrow({
          where: { id: tenant.profileId },
          include: { permissionTemplate: true },
        }),
      );
      const t = user.permissionTemplate;
      return rootGrantsFrom(t.isAllScreens, t.allowedScreens, t.screenActions as ScreenActionMap | null);
    }
    // قالبُ المنشأة تحت سياقها (`ق-٦٧٥` · المرحلة ③) — كما صار يقرأ `tenant.guard.ts`.
    const company = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
      tx.company.findUniqueOrThrow({
        where: { id: tenant.companyId },
        include: { permissionTemplate: true },
      }),
    );
    const t = company.permissionTemplate;
    return rootGrantsFrom(t.isAllScreens, t.allowedScreens, t.screenActions as ScreenActionMap | null);
  }

  /**
   * الصفوف الخام — **تحت سياق المستأجر لا خارجه**.
   *
   * `delegation_logs` عليه `RLS ENABLE + FORCE`. وقراءةٌ خارج السياق تعود
   * **فارغةً بنجاح** — لا خطأ ولا تحذير. وقد أوقعنا هذا فعلاً في سكربت
   * ترحيلٍ سابق: «205 ناقصة» ثم «203 أُنشئت» ثم «205 ناقصة» — والتناقض
   * وحده هو ما كشفه. فالفراغ هنا يعني «لا تفويض»، ومن خارج السياق يعني
   * «لم أرَ شيئاً» — والاثنان يبدوان سواء.
   */
  private rowsFor(companyId: string): Promise<DelegationRow[]> {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.$queryRaw<DelegationRow[]>`
        SELECT "grantorId", "granteeId", "grants", "state"
        FROM "delegation_logs"
        ORDER BY "seq" ASC
      `,
    );
  }
}

/**
 * يقصر مجموعة الأزواج على شاشاتٍ بعينها.
 *
 * @param screens `null` يعني **لا ترشيح** — تُعاد المجموعة كما هي.
 *
 * ⚠️ و`null` ليست «مجموعة فارغة»: الفارغة تُخفي كل شيء، و`null` تُظهر كل
 * شيء. وخلطُهما هو الفرق بين «تاجرٌ لم يختر نشاطه» و«تاجرٌ بلا شاشات».
 */
function narrowToScreens(grants: RootGrants, screens: ReadonlySet<string> | null): RootGrants {
  if (!screens) return grants;
  const out = new Set<Grant>();
  for (const g of grants) if (screens.has(g.slice(0, g.lastIndexOf(':')))) out.add(g);
  return out;
}

/** الشجرة مقصورةً على الشاشات التي يملك فيها الفاعل فعلاً واحداً على الأقل. */
function treeFor(grants: ReadonlySet<Grant>): TreeNode[] {
  const held = new Set<string>();
  for (const g of grants) held.add(g.slice(0, g.lastIndexOf(':')));
  return buildTree()
    .map((d) => {
      const screens = d.screens.filter((s) => held.has(s));
      return { ...d, screens, children: d.children.filter((c) => held.has(c.key)) };
    })
    .filter((d) => d.screens.length > 0);
}
