import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { TenantContext } from '../auth/types';
import { clipToCompany, companyGrantsOf, grantsOf } from '../templates/template-clip.util';
import { Grant } from './permission-tree';
import { DelegationLogEntry, DelegationEvent, LogNode, append, buildLogTree, findSequenceBreak } from './delegation-log';
import { assertNoCycle } from './cycles';
import { DelegationRow, chainsFor, liveEdges } from './chain-source';
import { actorGrants, effectiveGrants } from './intersection';
import { rootGrantsFrom } from './root-grants';
import { ExtinguishedGrant, splitLastLink } from './extinguished';

/**
 * كتابة التفويض وقراءته — **الحكم هنا، والواجهة تعرض**.
 *
 * ## القاعدة التي تُفرض في هذا الملف وحده
 *
 * > لا يمنح المفوَّض ما لا يملكه هو.
 *
 * والواجهة **ترشّح الشجرة بما يملك** فلا تعرض ما لا يجوز منحه — لكن
 * الترشيح **عرضٌ لا منع**: طلبٌ مصنوع بيد يتجاوزه في ثانية. فالسقف يُفحص
 * هنا على كل منحة، وحارسٌ يطرق النقطة مباشرةً بلا واجهة يثبت ذلك.
 *
 * ## ولماذا الصفّ لا يُحذف عند السحب
 *
 * السحب **ختمٌ لا محو**: `ACTIVE ⇒ SEALED ⇒ REVOKED`، ومُشغِّل القاعدة
 * يرفض كل تعديلٍ سواه ويرفض الحذف مطلقاً. والسبب نظامي لا ذوقي: الملحق (1)
 * من قرار هيئة الزكاة والضريبة والجمارك يجعل
 * `Allows for log modification/deletion` وظيفةً محظورة.
 *
 * ## ولماذا لا خدمة «إبطال متتالي»
 *
 * سحبُ صلاحية من مشرفٍ يطفئ ما وزّعه **بحكم التقاطع نفسه** في الطلب
 * التالي — لا بوظيفةٍ تمشي على الأبناء. ووظيفةٌ كتلك تُنسى أو تفشل جزئياً،
 * فتترك مرؤوسين يعملون بصلاحيةٍ سُحبت من فوقهم.
 */

/** ما يراه المفوِّض عن موظفٍ بعينه — الحالات الثلاث مفصولةً. */
export interface DelegationView {
  granteeId: string;
  /** ما يجوز للمفوِّض منحه = ما يملكه هو. مرشَّحاً في الخادم. */
  grantable: Grant[];
  /** صفوف التفويض القائمة بينهما. */
  links: DelegationRowView[];
  /** مُنح ونافذ الآن. */
  active: Grant[];
  /** مُنح وانطفأ — بسببه. الحالة الثالثة التي لا يجوز إخفاؤها. */
  extinguished: ExtinguishedGrant[];
}

export interface DelegationRowView {
  id: string;
  seq: number;
  grantorId: string;
  granteeId: string;
  nodeKey: string;
  grants: Grant[];
  state: string;
  createdAt: Date;
  revokedAt: Date | null;
}

interface RawRow extends DelegationRowView {
  companyId: string;
}

@Injectable()
export class DelegationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  // ═══════════════════ القراءة ═══════════════════

  /** ما فوّضه الفاعل لموظفٍ بعينه، بحالاته الثلاث. */
  async viewFor(tenant: TenantContext, granteeId: string): Promise<DelegationView> {
    const rows = await this.rows(tenant.companyId);
    const grantorGrants = await this.effectiveFor(tenant, rows, tenant.profileId);

    // الحلقة المباشرة بين الاثنين — وما تحتها هو ما يُعرَض.
    const between = rows.filter((r) => r.grantorId === tenant.profileId && r.granteeId === granteeId);

    const root = await this.rootFor(tenant);
    const chains = chainsFor(this.asChainRows(rows), granteeId);
    const effective = new Set<Grant>();
    for (const c of chains) for (const g of effectiveGrants(root, c)) effective.add(g);

    const extinguished: ExtinguishedGrant[] = [];
    const seen = new Set<string>();
    for (const c of chains) {
      for (const e of splitLastLink(root, c).extinguished) {
        if (effective.has(e.grant)) continue;
        const key = `${e.grant}|${e.atIndex}|${e.grantorId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        extinguished.push(e);
      }
    }

    // النافذ يُقصَر على ما مُنح في هذه الحلقة: صلاحيةٌ يملكها الموظف من
    // قالبه ليست «ممنوحةً منك»، وعرضُها كذلك يوحي بسلطةٍ لا تملكها.
    const grantedHere = new Set<Grant>(between.filter((r) => r.state === 'ACTIVE').flatMap((r) => r.grants));

    return {
      granteeId,
      grantable: [...grantorGrants].sort(),
      links: between.map(stripCompany),
      active: [...grantedHere].filter((g) => effective.has(g)).sort(),
      extinguished: extinguished.filter((e) => grantedHere.has(e.grant)),
    };
  }

  /**
   * السجل الشجري للمنشأة كلها — **والمسحوب ظاهرٌ مختوماً لا محذوفاً**.
   *
   * ويعيد فحص التسلسل معه: فجوةٌ في `seq` تعني صفّاً غاب، وهي الإشارة
   * الوحيدة على عبثٍ نجا من المُشغِّلات. وإخفاؤها يجعل السجل يبدو سليماً
   * وهو ليس كذلك.
   */
  async logTree(tenant: TenantContext): Promise<{ roots: LogNode[]; rows: DelegationRowView[]; sequenceBreak: { at: number; expected: number } | null }> {
    const rows = await this.rows(tenant.companyId);
    const entries = rows.map(toEntry);

    // ⚠️ **غابةٌ لا شجرة.** `buildLogTree` يمشي نزولاً من جذرٍ واحد، فبناءٌ
    // من `tenant.profileId` وحده **يُخفي** كل تفويضٍ بين موظفَين لم يمرّ
    // بالفاعل — وهو أكثر ما يحتاج المالك رؤيته. والإخفاء هنا صامت: السجل
    // يبدو كاملاً وهو ناقص، وهي عائلة العطب التي نطاردها.
    //
    // فكل مَن فوّض ولم يُفوَّض إليه أحد جذرٌ مستقل. والفاعل يُضاف دائماً
    // ولو لم يفوّض — كي تبدأ الشاشة من موضعه لا من فراغ.
    const grantees = new Set(entries.map((e) => e.granteeId));
    const rootIds = [tenant.profileId, ...new Set(entries.map((e) => e.grantorId).filter((g) => g !== tenant.profileId && !grantees.has(g)))];

    return {
      roots: rootIds.map((id) => buildLogTree(entries, id)),
      rows: rows.map(stripCompany),
      sequenceBreak: findSequenceBreak(entries),
    };
  }

  // ═══════════════════ الكتابة ═══════════════════

  /** يمنح — بعد فحص السقف والدورة. */
  async grant(tenant: TenantContext, granteeId: string, nodeKey: string, requested: readonly Grant[]): Promise<DelegationRowView> {
    if (!requested.length) throw new BadRequestException(MSG.delegation_empty_grant);
    if (granteeId === tenant.profileId) throw new BadRequestException(MSG.delegation_self);

    // الموظف موجودٌ في **هذه** المنشأة — لا معرّفٌ يُرسَل بيد.
    // وتحت سياقها (`ق-٦٥٧` · المرحلة ①): الجوابُ نفسُه اليوم، ويبقى يوم يُغلق `company_users`.
    const grantee = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
      tx.companyUser.findFirst({ where: { id: granteeId, companyId: tenant.companyId }, select: { id: true } }),
    );
    if (!grantee) throw new NotFoundException(MSG.delegation_grantee_not_found);

    const rows = await this.rows(tenant.companyId);

    // ⚠️ **السقف يُفحص هنا لا في الواجهة.** ترشيحُ الشجرة عرضٌ لا منع:
    // طلبٌ مصنوع بيد يتجاوزه. وبدون هذا السطر يستطيع موظفٌ منح نفسه — عبر
    // وسيط — ما لا يملكه أحد فوقه.
    const ceiling = await this.effectiveFor(tenant, rows, tenant.profileId);
    const beyond = requested.filter((g) => !ceiling.has(g));
    if (beyond.length) throw new ForbiddenException(MSG.delegation_exceeds_grantor);

    assertNoCycle(liveEdges(this.asChainRows(rows)), tenant.profileId, granteeId);

    const previous = rows.length ? toEntry(rows[rows.length - 1]) : null;
    const entry = append(
      { companyId: tenant.companyId, event: 'GRANT' as DelegationEvent, grantorId: tenant.profileId, granteeId, nodeKey, grants: requested },
      previous,
    );

    return this.insert(tenant.companyId, entry);
  }

  /**
   * يسحب — **ختماً على مرحلتين**، لأن المُشغِّل لا يقبل غيرهما.
   *
   * `ACTIVE ⇒ SEALED` ثم `SEALED ⇒ REVOKED`. وقفزُ الوسط مرفوضٌ من القاعدة
   * لا من الشيفرة: الختم خطوةٌ مرئية في السجل، لا انتقالٌ ذرّي يمحو أثره.
   */
  async revoke(tenant: TenantContext, id: string): Promise<DelegationRowView> {
    const rows = await this.rows(tenant.companyId);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new NotFoundException(MSG.delegation_not_found);
    if (row.state !== 'ACTIVE') throw new BadRequestException(MSG.delegation_already_revoked);
    // صاحب المنشأة يسحب أي تفويض في منشأته؛ وغيره يسحب ما منحه هو.
    if (tenant.actorType !== 'COMPANY' && row.grantorId !== tenant.profileId) {
      throw new ForbiddenException(MSG.delegation_revoke_forbidden);
    }

    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      await tx.$executeRaw`UPDATE "delegation_logs" SET "state" = 'SEALED' WHERE "id" = ${id} AND "state" = 'ACTIVE'`;
      await tx.$executeRaw`UPDATE "delegation_logs" SET "state" = 'REVOKED' WHERE "id" = ${id} AND "state" = 'SEALED'`;
      const [updated] = await tx.$queryRaw<RawRow[]>`
        SELECT "id", "companyId", "seq", "grantorId", "granteeId", "nodeKey", "grants", "state", "createdAt", "revokedAt"
        FROM "delegation_logs" WHERE "id" = ${id}
      `;
      return stripCompany(updated);
    });
  }

  // ═══════════════════ الداخلية ═══════════════════

  /**
   * الصفوف الخام — **تحت سياق المستأجر لا خارجه**.
   *
   * `RLS ENABLE + FORCE` على الجدول: قراءةٌ خارج السياق تعود **فارغةً
   * بنجاح**، فيبدو «لا تفويض» و«لم أرَ شيئاً» سواء. وقد أوقعنا هذا فعلاً في
   * سكربت ترحيلٍ سابق، ولم يكشفه إلا تناقضٌ في الأرقام.
   */
  private rows(companyId: string): Promise<RawRow[]> {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.$queryRaw<RawRow[]>`
        SELECT "id", "companyId", "seq", "grantorId", "granteeId", "nodeKey", "grants", "state", "createdAt", "revokedAt"
        FROM "delegation_logs" ORDER BY "seq" ASC
      `,
    );
  }

  private async insert(companyId: string, entry: DelegationLogEntry): Promise<DelegationRowView> {
    try {
      return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const [row] = await tx.$queryRaw<RawRow[]>`
          INSERT INTO "delegation_logs" ("id", "companyId", "seq", "grantorId", "granteeId", "nodeKey", "grants", "state")
          VALUES (gen_random_uuid()::text, ${entry.companyId}, ${entry.seq}, ${entry.grantorId}, ${entry.granteeId}, ${entry.nodeKey}, ${entry.grants}::text[], 'ACTIVE')
          RETURNING "id", "companyId", "seq", "grantorId", "granteeId", "nodeKey", "grants", "state", "createdAt", "revokedAt"
        `;
        return stripCompany(row);
      });
    } catch (e) {
      // ⚠️ التسلسل يُحسب من قراءةٍ سابقة، ومنحتان متزامنتان تقرآن الرقم
      // نفسه. الفهرس الفريد `(companyId, seq)` يرفض إحداهما — **وهو
      // التصرّف الصحيح**: تجاوزُه بترقيمٍ متساهل يفتح فجوةً في التسلسل،
      // وكشفُ الفجوة هو الإشارة الوحيدة على عبثٍ نجا من المُشغِّلات.
      // فيُترجَم الرفض إلى رسالةٍ تقول «أعد المحاولة» ولا يُبتلع.
      if (isUniqueViolation(e)) throw new BadRequestException(MSG.delegation_sequence_conflict);
      throw e;
    }
  }

  /** سقف القالب — بنفس المصدر والحكم اللذين يقرؤهما `tenant.guard.ts`: قالبُ الموظّف مقصوصاً بقالب منشأته (توجيه ٢٧٦ · ق-١٦٠١). */
  private async rootFor(tenant: TenantContext) {
    // قالبُ المنشأة تحت سياقها (`ق-٦٧٥` · المرحلة ③) — كما صار يقرأ `tenant.guard.ts`.
    const c = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
      tx.company.findUniqueOrThrow({ where: { id: tenant.companyId }, include: { permissionTemplate: true } }),
    );
    if (tenant.actorType === 'COMPANY_USER') {
      // تحت سياق المنشأة (`ق-٦٥٧` · المرحلة ①) — كما صار يقرأ `tenant.guard.ts` نفسُه.
      const u = await this.tenantPrisma.runInTenantContext(tenant.companyId, (tx) =>
        tx.companyUser.findUniqueOrThrow({ where: { id: tenant.profileId }, include: { permissionTemplate: true } }),
      );
      const clipped = clipToCompany(grantsOf(u.permissionTemplate), companyGrantsOf(c.permissionTemplate));
      return rootGrantsFrom(clipped.isAllScreens, clipped.allowedScreens, clipped.screenActions);
    }
    const owner = companyGrantsOf(c.permissionTemplate);
    return rootGrantsFrom(owner.isAllScreens, owner.allowedScreens, owner.screenActions);
  }

  /** ما يملكه فاعلٌ فعلاً = تقاطع قالبه مع سلاسله. */
  private async effectiveFor(tenant: TenantContext, rows: readonly RawRow[], actorId: string): Promise<Set<Grant>> {
    const root = await this.rootFor(tenant);
    // صاحب المنشأة جذرٌ بطبعه — لا أحد يفوّضه.
    if (tenant.actorType === 'COMPANY') return new Set(root);
    return actorGrants(root, chainsFor(this.asChainRows(rows), actorId));
  }

  private asChainRows(rows: readonly RawRow[]): DelegationRow[] {
    return rows.map((r) => ({ grantorId: r.grantorId, granteeId: r.granteeId, grants: r.grants, state: r.state }));
  }
}

function stripCompany(r: RawRow): DelegationRowView {
  const { companyId: _ignored, ...rest } = r;
  return rest;
}

/** الصفّ ⇒ قيد السجل. `event` مشتقٌّ من الحالة لا مخزَّن — عمود `state` هو الحقيقة. */
function toEntry(r: RawRow): DelegationLogEntry {
  return {
    seq: r.seq,
    companyId: r.companyId,
    event: r.state === 'ACTIVE' ? 'GRANT' : 'REVOKE',
    grantorId: r.grantorId,
    granteeId: r.granteeId,
    nodeKey: r.nodeKey,
    grants: r.grants,
    at: r.createdAt,
  };
}

/**
 * ⚠️ `P2002` وحده لا يكفي هنا.
 *
 * الإدراج يمرّ بـ`$queryRaw`، و Prisma لا يفكّك خطأ الاستعلام الخام إلى
 * `P2002` بل يلفّه في `P2010` حاملاً رمز Postgres الأصلي `23505` في نصّه.
 * فالفحص على الاثنين — واقتصارُه على الأول يجعل التعارض يُرمى كـ500 بلا
 * رسالة عربية، وهو بالضبط ما يبدو «عطلاً في المنصة».
 */
function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return true;
    if (e.code === 'P2010' && String(e.meta?.code ?? e.message).includes('23505')) return true;
  }
  return String((e as { message?: string })?.message ?? '').includes('23505');
}
