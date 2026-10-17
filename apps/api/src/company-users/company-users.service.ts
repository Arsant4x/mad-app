import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { CredentialChange, CredentialChangeNotice, CredentialChangeService } from '../common/credentials/credential-change.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { assertBranchIdsAssignable, assertNoOpenShiftOutside, replaceBranchAssignments } from './branch-assignment.util';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { assertPasswordPolicy } from '../common/password/password-policy';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — اسمُ الموظّف. */
const COMPANY_USER_SEARCH_FIELDS = ['name'] as const;

/** `branches` is the join rows only — deliberately not `include: { branch: true }`.
 * The client already loads the branch list for its picker and resolves the
 * names from these ids, so the lighter shape is the contract.
 *
 * (Until `ق-٦٥٧` المرحلة ① this service ran on the raw PrismaService and the
 * nested `branch` would have failed under RLS; every read now runs under the
 * tenant context, but the response shape stays as it was.) */
const COMPANY_USER_INCLUDE = { permissionTemplate: true, branches: { select: { branchId: true } } } as const;

type Tx = Prisma.TransactionClient;

/** Sub-accounts are managed only by the company owner itself (actorType
 * COMPANY), not by another employee sub-account — matches the mockup's
 * single-level parentAccountId model, and keeps this from becoming a
 * multi-level hierarchy the schema doesn't represent. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_users_owner_only);
  }
}

/**
 * 🔴 **كلُّ قراءةٍ وكتابةٍ هنا تحت سياق المنشأة** (`ق-٦٥٧` · المرحلة ①).
 *
 * `company_users` و`company_user_branches` بلا `RLS` اليوم، **وكانت هذه الخدمةُ
 * تقرؤهما بلا سياق** — فإغلاقُهما (المرحلة ④) كان سيُسقطها: `deleteMany` يمسّ
 * صفراً صامتاً، و`createMany` يصرخ بانتهاك السياسة، والقراءةُ تعود فارغةً بنجاح.
 * **القياسُ الحيّ**: تسعةٌ من عشرين في `branches.e2e` حمراءُ تحت الطُّعم قبل
 * النقل، وخضراءُ كلُّها بعده. السياقُ لا يغيّر شيئاً اليوم — ويجعل الإغلاقَ ممكناً.
 */
@Injectable()
export class CompanyUsersService {
  private readonly logger = new Logger(CompanyUsersService.name);

  // لا `PrismaService` خامٌ هنا بعد المرحلة ①: كلُّ نداءٍ يمرّ بسياق المنشأة.
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly credentials: CredentialChangeService,
  ) {}

  list(companyId: string, actorType: string, query?: PagedQueryDto) {
    assertIsCompanyOwner(actorType);
    const where: Prisma.CompanyUserWhereInput = { companyId, ...searchWhere(searchTerm(query), COMPANY_USER_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      pagedFindMany(query, tx.companyUser, { where, include: COMPANY_USER_INCLUDE, orderBy: { createdAt: 'asc' } }),
    );
  }

  async create(
    companyId: string,
    actorType: string,
    allowedBranchIds: string[] | 'all',
    dto: CreateCompanyUserDto,
    actor?: { id: string; name: string },
  ) {
    assertIsCompanyOwner(actorType);
    assertPasswordPolicy(dto.password, { username: dto.username });

    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const template = await tx.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId }, select: { companyId: true, isSystem: true } });
      // Global preset or this company's own — a guessed id must never smuggle
      // in another company's template (actor rule, §3.5).
      if (!template || (template.companyId !== null && template.companyId !== companyId)) throw new NotFoundException(MSG.template_not_found);
      if (template.isSystem) throw new ForbiddenException(MSG.template_system_not_assignable);

      // قبل إنشاء أي شيء — فرع مرفوض بعد إنشاء الحساب كان سيترك حساباً
      // نصف مُنشأ، وإعادة المحاولة تصطدم بـusername_taken.
      // ⚖️ `ق-١٤٦٨`: «كلُّ الفروع» علَمٌ صريح لا يجتمع مع قائمة — والتعارضُ يُردّ مسمّىً لا يُحسم بافتراض.
      if (dto.allBranches && dto.branchIds?.length) throw new BadRequestException(MSG.company_user_all_branches_conflict);
      // ومنحُ «الكلّ» لمن نطاقُه الكلّ — سلامةٌ ذاتيّة كفحص الإسناد (`ق-٥١٤`)، لا اعتمادٌ على أن المسارَ للمالك وحده.
      if (dto.allBranches && allowedBranchIds !== 'all') throw new ForbiddenException(MSG.branch_forbidden);
      if (dto.branchIds?.length) await this.assertBranchIdsAssignable(tx, allowedBranchIds, dto.branchIds);

      const existing = await tx.loginIdentity.findUnique({ where: { username: dto.username } });
      if (existing) {
        /**
         * ⚠️ **الاصطدام يُسجَّل — وقد صار يُسجَّل بنيةً لا بيدٍ هنا** (`ق-٥١١`).
         *
         * **كان `AuditInterceptor` يسجّل بـ`tap((result) => …)` — مسار النجاح
         * وحده**، **فالإخفاقات لا تترك أثراً إطلاقاً**، و«تعدادُ الأسماء» **كلّه
         * إخفاقات**: من يجرّب مئة اسم ليعرف أيّها موجود لا يُنشئ حساباً واحداً.
         * **أي أن الهجوم كان غير مرئيٍّ بنيوياً لا «غير ملحوظ»** — **فسُجِّل هنا
         * بيدٍ، في موضعٍ واحدٍ من عشرات**.
         *
         * ⇒ **والآن يسجّله المسجِّلُ نفسُه لكلّ `409` و`403`** — **فحُذف التسجيلُ
         * اليدويّ لئلّا يُكتب القيدُ مرّتين**. 📌 **وقاعدتُه الثانية عُمّمت معه**:
         * **لا يُسجَّل جسمُ الطلب في الرفض** — **فتسجيلُ ما حاوله يجعل السجلَّ
         * نسخةً ثانية من التسريب**، والغرضُ كشفُ النمط لا حفظُ المحاولة.
         */
        throw new ConflictException(formatMessage(MSG.username_taken, { username: dto.username }));
      }

      const identity = await tx.loginIdentity.create({
        data: {
          username: dto.username,
          passwordHash: await argon2.hash(dto.password),
          actorType: 'COMPANY_USER',
          // منشأةُ الهويّة (`ق-٦٦٦`) — تُكتب هنا إعلاناً، **والقاعدةُ تفرضها**: مشغِّلُ
          // `company_users_identity_follows` يرفض صفَّ حسابٍ لهويّةٍ منشأتُها غيرُ منشأته.
          companyId,
          companyUser: {
            create: {
              companyId,
              name: dto.name,
              permissionTemplateId: dto.permissionTemplateId,
              allBranches: dto.allBranches === true,
              canEditMasterData: dto.canEditMasterData === true,
            },
          },
        },
        include: { companyUser: { include: COMPANY_USER_INCLUDE } },
      }).catch((e: unknown) => {
        // A concurrent create of the same username can pass the check above; the unique index refuses the second.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(formatMessage(MSG.username_taken, { username: dto.username }));
        throw e;
      });

      if (dto.branchIds?.length) {
        await this.replaceBranchAssignments(tx, identity.companyUser!.id, dto.branchIds);
        return tx.companyUser.findUniqueOrThrow({ where: { id: identity.companyUser!.id }, include: COMPANY_USER_INCLUDE });
      }
      return identity.companyUser!;
    });
  }

  async update(companyId: string, actorType: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateCompanyUserDto) {
    assertIsCompanyOwner(actorType);

    const { updated, notice } = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      let notice: CredentialChangeNotice | null = null;
      const existing = await tx.companyUser.findUnique({ where: { id } });
      if (!existing || existing.companyId !== companyId) throw new NotFoundException(MSG.company_user_not_found);

      if (dto.permissionTemplateId) {
        const template = await tx.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId }, select: { companyId: true, isSystem: true } });
        // Global preset or this company's own — a guessed id must never smuggle
        // in another company's template (actor rule, §3.5).
        if (!template || (template.companyId !== null && template.companyId !== companyId)) throw new NotFoundException(MSG.template_not_found);
        if (template.isSystem) throw new ForbiddenException(MSG.template_system_not_assignable);
      }

      const current = await tx.loginIdentity.findUniqueOrThrow({ where: { id: existing.loginIdentityId }, select: { username: true } });
      if (dto.password) assertPasswordPolicy(dto.password, { username: dto.username ?? current.username });

      const username = dto.username && dto.username !== current.username ? dto.username : undefined;
      if (username) {
        const clash = await tx.loginIdentity.findUnique({ where: { username } });
        if (clash && clash.id !== existing.loginIdentityId) throw new ConflictException(formatMessage(MSG.username_taken, { username }));
      }
      // A new username or password ends the employee's sessions in the same transaction: a new
      // credential without the revocation committed with it is a half state.
      const changes: CredentialChange[] = [];
      if (username) changes.push('username');
      if (dto.password) changes.push('password');
      if (changes.length) {
        const passwordHash = dto.password ? await argon2.hash(dto.password) : undefined;
        try {
          await tx.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { username, passwordHash } });
        } catch (e) {
          // A concurrent rename to the same username can pass the check above; the unique index refuses the second.
          if (username && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(formatMessage(MSG.username_taken, { username }));
          throw e;
        }
        notice = await this.credentials.record(tx, existing.loginIdentityId, changes);
      }

      /**
       * ⚖️ `ق-١٤٦٨` — **العلَمُ والقائمةُ حالةٌ واحدةٌ لا اثنتان**: «كلُّ الفروع» مع قائمةٍ غيرِ فارغة يُردّ مسمّىً؛
       * و«الكلّ» يُفرغ الإسنادَ فلا تُخزَّن حالتان متعارضتان؛ وقائمةٌ غيرُ فارغةٍ بلا ذكر العلَم تقييدٌ صريحٌ فيُطفأ العلَم.
       * والقائمةُ الفارغةُ بلا علَمٍ **لا فرع** — لا «الكلّ» كما كانت.
       */
      let allBranches: boolean | undefined = dto.allBranches;
      if (dto.allBranches === true && dto.branchIds?.length) throw new BadRequestException(MSG.company_user_all_branches_conflict);
      if (dto.allBranches === undefined && dto.branchIds?.length) allBranches = false;
      if (dto.allBranches === true && allowedBranchIds !== 'all') throw new ForbiddenException(MSG.branch_forbidden);
      if (dto.branchIds !== undefined) {
        await this.assertBranchIdsAssignable(tx, allowedBranchIds, dto.branchIds);
        // ⚖️ ق-١٤٤٦ — الإغلاقُ قبل النقل: لا يُخرَج الحسابُ من فرع مناوبته المفتوحة.
        await assertNoOpenShiftOutside(tx, id, dto.branchIds);
        await this.replaceBranchAssignments(tx, id, dto.branchIds);
      } else if (allBranches === true) {
        await this.replaceBranchAssignments(tx, id, []);
      }

      /**
       * **التعطيلُ يُنهي الجلساتِ لا يُوقفها** (`ق-١٢٥٣`/③ — `domain-scan/09` A2).
       *
       * الحارسُ يقرأ الحالةَ من القاعدة فيرفض الطلبَ التالي فوراً، وتحديثُ الجلسة يرفض
       * غيرَ `ACTIVE` — **لكنّ رموزَ التحديث كانت تبقى صالحة**: جهازٌ صامت أثناء
       * التعطيل يعود بعد إعادة التفعيل بلا دخولٍ جديد (قِيس: `expected 401, got 200`).
       * فتُبطَل رموزُ الهويّة كلُّها عند أيِّ حالةٍ غيرِ `ACTIVE` — وإعادةُ التفعيل تفتح
       * الدخولَ بالكلمة لا الجلسةَ القديمة. (جدولُ منصّةٍ بلا منشأة — يُبلَغ عبر هويّةِ
       * موظفٍ ثبت أنه لهذه المنشأة أعلاه.)
       */
      if (dto.status !== undefined && dto.status !== 'ACTIVE') {
        await tx.refreshToken.updateMany({
          where: { loginIdentityId: existing.loginIdentityId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      const updated = await tx.companyUser.update({
        where: { id },
        data: { name: dto.name, permissionTemplateId: dto.permissionTemplateId, status: dto.status, canEditMasterData: dto.canEditMasterData, allBranches },
        include: COMPANY_USER_INCLUDE,
      });
      return { updated, notice };
    });
    if (notice) this.credentials.notify(notice);
    return updated;
  }

  /** Every id must belong to this company — a branch id from elsewhere would
   * otherwise be stored and then silently widen this employee's visibility.
   * Same re-validation rule as any foreign id off a request body (see the
   * journal cross-tenant lesson).
   *
   * Reads `branches` (RLS-protected) through the caller's tenant transaction —
   * outside a context it would see zero rows and reject every valid id. */
  /**
   * **الفروعُ للمنشأة — ومن فروع المُسنِد** (`ق-٥١٤`).
   *
   * **كان الفحصُ الأوّلَ وحده**: أن الفروع للمنشأة. ⇒ **فمن يُسنِد فرعاً لا
   * يملكه يمنح صلاحيةً دائمةً عليه** — **وأثرُه يبقى بعد الفعل**، بخلاف من
   * يُنشئ صفّاً في فرعٍ آخر مرّةً واحدة.
   *
   * ⚠️ **ولا يتغيّر شيءٌ اليوم**: المسارُ كلُّه مغلقٌ على مالك المنشأة
   * (`assertIsCompanyOwner`) **ونطاقُه `all`** — **مقيسٌ**. **فالتحقّقُ هنا
   * سلامةٌ ذاتيّةٌ تحلّ محلَّ سلامةٍ مستعارة** (`ق-٥١٣`): **حارسٌ يعتمد على
   * بوّابةٍ أخرى يسقط يوم تُفتَح تلك البوّابة، ولا يشتكي**.
   */
  private async assertBranchIdsAssignable(tx: Tx, allowedBranchIds: string[] | 'all', branchIds: string[]): Promise<void> {
    // والإذنُ بعد الوجود، والمغلقُ لا يُسنَد إليه — بالمصدر الواحد نفسِه الذي يمرّ به نقلُ الموظّف المربوط (`ق-١٤٤٥` · `ق-١٤٥٣`).
    await assertBranchIdsAssignable(tx, allowedBranchIds, branchIds);
  }

  /** Replace-all: the payload is the complete desired set, so diffing would
   * only add a way for the two to drift apart. Empty = no branch (`ق-١٤٦٨`); «all» is `allBranches`. */
  private async replaceBranchAssignments(tx: Tx, companyUserId: string, branchIds: string[]): Promise<void> {
    await replaceBranchAssignments(tx, companyUserId, branchIds);
  }

  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);

    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.companyUser.findUnique({ where: { id } });
      if (!existing || existing.companyId !== companyId) throw new NotFoundException(MSG.company_user_not_found);

      await tx.loginIdentity.delete({ where: { id: existing.loginIdentityId } });
    });
  }
}
