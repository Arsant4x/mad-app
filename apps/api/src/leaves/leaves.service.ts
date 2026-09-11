import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { SELF_REVIEW_ACTION, SELF_REVIEW_ENTITY } from '../common/self-review';
import { CreateLeaveRequestDto, CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave.dto';

const REQUEST_INCLUDE = {
  employee: { select: { id: true, fullName: true } },
  leaveType: { select: { id: true, name: true, paid: true, annualDays: true } },
} as const;

/**
 * ما يحتاجه الصفُّ والسجلُّ عن الفاعل — **اسمُه وقتَ الفعل لا معرّفُه وحده**،
 * على صيغة `Approver` في مسار الشطب نصّاً (`ق-٦٢١`/① — فلا نمطان حيث نمطٌ قائم).
 */
export interface LeaveActor {
  id: string;
  actorType: string;
  name: string;
}

/** Inclusive calendar days between two dates — a one-day leave (start === end)
 * counts as 1. Leave in Saudi practice is counted in calendar days, and keeping
 * this simple and predictable avoids baking a working-week assumption the owner
 * hasn't stated. */
function inclusiveDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

@Injectable()
export class LeavesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Leave types ----

  listTypes(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.leaveType.findMany({ orderBy: { name: 'asc' } }));
  }

  createType(companyId: string, dto: CreateLeaveTypeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // Two-layer uniqueness (CLAUDE.md 6.6): a readable Arabic error here, plus
      // the DB @@unique as the real guard against a concurrent duplicate.
      const clash = await tx.leaveType.findFirst({ where: { name: dto.name.trim() } });
      if (clash) throw new ConflictException(MSG.leave_type_duplicate_name);
      return tx.leaveType.create({
        data: { name: dto.name.trim(), annualDays: dto.annualDays ?? 0, paid: dto.paid ?? true } as unknown as Prisma.LeaveTypeUncheckedCreateInput,
      });
    });
  }

  updateType(companyId: string, id: string, dto: UpdateLeaveTypeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.leaveType.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.leave_type_not_found);
      if (dto.name && dto.name.trim() !== existing.name) {
        const clash = await tx.leaveType.findFirst({ where: { name: dto.name.trim() } });
        if (clash) throw new ConflictException(MSG.leave_type_duplicate_name);
      }
      return tx.leaveType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.annualDays !== undefined ? { annualDays: dto.annualDays } : {}),
          ...(dto.paid !== undefined ? { paid: dto.paid } : {}),
        },
      });
    });
  }

  async removeType(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.leaveType.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.leave_type_not_found);
      // A type that requests point at can't be deleted — the history would lose
      // what kind of leave was taken.
      const used = await tx.leaveRequest.count({ where: { leaveTypeId: id } });
      if (used > 0) throw new ConflictException(MSG.leave_type_in_use);
      await tx.leaveType.delete({ where: { id } });
    });
  }

  // ---- Leave requests ----

  listRequests(companyId: string, employeeId?: string, status?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.leaveRequest.findMany({
        where: {
          ...(employeeId ? { employeeId } : {}),
          ...(status ? { status: status as Prisma.EnumLeaveRequestStatusFilter['equals'] } : {}),
        },
        include: REQUEST_INCLUDE,
        orderBy: { startDate: 'desc' },
      }),
    );
  }

  createRequest(companyId: string, actor: LeaveActor, dto: CreateLeaveRequestDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      if (start > end) throw new BadRequestException(MSG.leave_dates_invalid);

      // Both foreign ids come off a request body, so re-check they belong to
      // this company under the tenant-scoped tx before trusting them.
      const employee = await tx.employee.findUnique({ where: { id: dto.employeeId }, select: { id: true } });
      if (!employee) throw new NotFoundException(MSG.employee_not_found);
      const leaveType = await tx.leaveType.findUnique({ where: { id: dto.leaveTypeId }, select: { id: true } });
      if (!leaveType) throw new NotFoundException(MSG.leave_type_not_found);

      // Can't be on two leaves at once: any pending-or-approved request whose
      // span touches this one is a conflict. A rejected one never blocks.
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          employeeId: dto.employeeId,
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (overlap) throw new ConflictException(MSG.leave_overlap);

      return tx.leaveRequest.create({
        data: {
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate: start,
          endDate: end,
          days: inclusiveDays(start, end),
          reason: dto.reason,
          status: 'PENDING',
          // ⭐ **من قدّم — بهويّة الفاعل**: هو الطرفُ الذي يُقارَن به المقرِّر،
          //    و`employeeId` أعلاه صاحبُ الإجازة **لا هويّةَ دخولٍ له**.
          requestedById: actor.id,
          requestedByName: actor.name,
        } as unknown as Prisma.LeaveRequestUncheckedCreateInput,
        include: REQUEST_INCLUDE,
      });
    });
  }

  /**
   * ⭐ **الاعتماد أو الرفض — ومعه الفصلُ بين من قدّم ومن قرّر** (`ق-٦٢١`).
   *
   * والمعلَّقُ وحدَه يُبَتّ فيه، فنداءٌ مكرَّرٌ أو سباقٌ لا يقلب محسوماً.
   *
   * ## ما كان ناقصاً — والفصلُ لا الأثر
   *
   * `AuditInterceptor` عامٌّ ويكتب المعتمِدَ في كلّ حال، **فالأثرُ كان قائماً**.
   * **والناقصُ كان الفصل**: لا حقلَ على الصفّ يُقارَن به، **فلا حارسَ يمنع ولا
   * شاشةَ تعرض «اعتمده فلان» بلا نبش السجلّ بالمعرّف**.
   *
   * ## ⚠️ ولماذا لا يُقارَن المقرِّرُ بـ`employeeId`
   *
   * **`Employee` لا يرتبط بهويّة دخولٍ بأيّ حقل** — لا `CompanyUser` ولا
   * `LoginIdentity` (مقيسٌ من المخطط: يشير إليه `Company` و`Branch`
   * و`LeaveRequest` و`AttendanceRecord` فحسب). ⇒ **فمقارنةُ `decidedById`
   * بـ`employeeId` مقارنةُ فضاءَي هويّةٍ مختلفَين، تمرّ دائماً ولا تعني شيئاً**.
   * **فالمقارنةُ على `requestedById`** — نظيرِ `recordedById` في الشطب.
   *
   * ## ⚖️ والمنعُ إعدادٌ لا أصل — بعددٍ لا بترجيح
   *
   * **بالبنية أولاً**: منشأةٌ تُنشأ **بفاعلٍ واحدٍ هو المالك**، والحساباتُ
   * الفرعية تُضاف بعدُ. ⇒ **ففيها يكون مُقدِّمُ الطلب هو الباتَّ بالضرورة**،
   * **ومنعٌ دائمٌ يعطّل الميزةَ لا يضبطها**. **ويُسنده عددٌ** (2026-09-12):
   * `493` من `512` منشأةً في قاعدة التطوير بلا حسابٍ فرعيٍّ واحد — ⚠️ **وهي
   * ليست عيّنةَ عملاء، فتشهد لشيوع الشكل لا لنسبةٍ في السوق**.
   *
   * ⇒ فالتشديدُ **خيارٌ معلوم** — و**الدائمُ هو فعلُ التسجيل لا المنع** (`ق-١٤٣`).
   */
  async decide(companyId: string, actor: LeaveActor, id: string, status: 'APPROVED' | 'REJECTED', note?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.leaveRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
      if (!existing) throw new NotFoundException(MSG.leave_request_not_found);
      if (existing.status !== 'PENDING') throw new ConflictException(MSG.leave_request_not_pending);

      // ⚠️ **والفارغُ غيرُ مقصود**: صفٌّ سُجّل قبل هذا الحقل لا يحمل قائلاً،
      //    **وفراغُه «غيرُ معلوم» فلا يُقارَن** — لا «ليس هو».
      const selfApproved = existing.requestedById !== null && existing.requestedById === actor.id;
      if (selfApproved) {
        const company = await tx.company.findUnique({ where: { id: companyId }, select: { leaveApprovalRequiresTwoPersons: true } });
        if (company?.leaveApprovalRequiresTwoPersons) {
          throw new ForbiddenException(formatMessage(MSG.leave_two_persons_required, { employee: existing.employee.fullName }));
        }
      }

      const saved = await tx.leaveRequest.update({
        where: { id },
        data: {
          status,
          decidedAt: new Date(),
          decidedNote: note?.trim() || null,
          decidedById: actor.id,
          decidedByName: actor.name,
        },
        include: REQUEST_INCLUDE,
      });

      /**
       * ⭐ **والفعلُ باسمه داخلَ المعاملة لا بعدها** — على سابقة الشطب نصّاً:
       * **قرارٌ وقع وشهادةٌ لم تُكتب أسوأُ من ألّا يقع** (`ق-١٤٧`). و`AuditLog`
       * منطاقٌ بالمستأجر و`app.company_id` مضبوطٌ على هذه المعاملة، فـ`RLS`
       * تمرّ كما تمرّ خارجها.
       *
       * 📌 **والاسمُ `self-review` نفسُه لا مشتقٌّ منه**: سؤالٌ واحدٌ
       * (`GET /audit-log?action=self-review`) **يُجيب عن كلّ اعتمادٍ ذاتيٍّ في
       * المنشأة**، ويميّز المسارَ حقلُ `entity`.
       */
      if (selfApproved) {
        await this.audit.recordWithinTx(tx, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.id,
          actorName: actor.name,
          screen: 'employees',
          action: SELF_REVIEW_ACTION,
          entity: SELF_REVIEW_ENTITY.leaveRequest,
          entityId: saved.id,
          method: 'POST',
          path: `/leaves/requests/${saved.id}/${status === 'APPROVED' ? 'approve' : 'reject'}`,
          details: {
            status,
            employeeId: saved.employeeId,
            employee: saved.employee.fullName,
            days: saved.days,
            requestedById: existing.requestedById,
          },
          ip: null,
        });
      }

      return { ...saved, selfApproved };
    });
  }

  /** Only a pending request can be withdrawn. A decided one is a record — an
   * approved leave that was taken, or a rejection someone was told about. */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.leaveRequest.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.leave_request_not_found);
      if (existing.status !== 'PENDING') throw new ConflictException(MSG.leave_request_not_pending);
      await tx.leaveRequest.delete({ where: { id } });
    });
  }

  /**
   * An employee's balance per leave type for a year, derived — never stored.
   *
   * `remaining` is null for a type with no fixed entitlement (`annualDays = 0`),
   * which reads as "unlimited" rather than "zero left" — the difference between
   * unpaid leave and a fully-consumed allowance.
   */
  balance(companyId: string, employeeId: string, year: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
      if (!employee) throw new NotFoundException(MSG.employee_not_found);

      const from = new Date(Date.UTC(year, 0, 1));
      const to = new Date(Date.UTC(year, 11, 31));
      const [types, approved] = await Promise.all([
        tx.leaveType.findMany({ orderBy: { name: 'asc' } }),
        tx.leaveRequest.findMany({
          where: { employeeId, status: 'APPROVED', startDate: { gte: from, lte: to } },
          select: { leaveTypeId: true, days: true },
        }),
      ]);

      const usedByType = new Map<string, number>();
      for (const r of approved) usedByType.set(r.leaveTypeId, (usedByType.get(r.leaveTypeId) ?? 0) + r.days);

      return {
        year,
        employeeId,
        types: types.map((t) => {
          const used = usedByType.get(t.id) ?? 0;
          return {
            leaveTypeId: t.id,
            name: t.name,
            paid: t.paid,
            entitlement: t.annualDays,
            used,
            remaining: t.annualDays > 0 ? t.annualDays - used : null,
          };
        }),
      };
    });
  }
}
