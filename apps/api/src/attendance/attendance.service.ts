import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { branchFilter } from '../branches/branch-scope.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { pagedFindMany, searchTerm } from '../common/pagination/paged.util';
import { DEVICE_CLOCK_TOLERANCE_MIN, zoneOffsetMin } from '../common/wall-clock.util';
import { RecordAttendanceDto, UpdateAttendanceDto } from './dto/attendance.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';

const RECORD_INCLUDE = { employee: { select: { id: true, fullName: true } } } as const;

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * The times of one day row as they will stand after the write. A check out earlier than the check in is refused, and
 * so is a day or a written time that has not come yet on the company's own clock, beyond the tolerance. The day is
 * the stored `@db.Date` read in UTC, and its wall-clock times are the company's local times.
 */
async function assertAttendanceTimes(
  tx: Prisma.TransactionClient,
  companyId: string,
  date: Date,
  row: { checkIn?: string | null; checkOut?: string | null },
  written: readonly (string | null | undefined)[],
): Promise<void> {
  const { checkIn, checkOut } = row;
  if (checkIn && checkOut && minutesOf(checkOut) < minutesOf(checkIn)) {
    throw new BadRequestException(formatMessage(MSG.attendance_checkout_before_checkin, { checkIn, checkOut }));
  }

  const { timeZone } = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { timeZone: true } });
  const now = new Date();
  const latest = now.getTime() + DEVICE_CLOCK_TOLERANCE_MIN * 60_000;
  const offsetMin = zoneOffsetMin(now, timeZone);
  const day = date.toISOString().slice(0, 10);
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const instantOf = (hhmm: string) => dayStart + (minutesOf(hhmm) - offsetMin) * 60_000;

  if (instantOf('00:00') > latest) throw new BadRequestException(formatMessage(MSG.attendance_date_in_future, { date: day }));
  for (const time of written) {
    if (time && instantOf(time) > latest) throw new BadRequestException(formatMessage(MSG.attendance_time_in_future, { date: day, time }));
  }
}

/**
 * الحضور والانصراف — SPEC 9.4, the second HR pillar after leaves.
 *
 * One row per employee per day (unique index): checking in twice edits the
 * day, it never forks it. Times are wall-clock strings, exactly what the
 * mockup records; minutes math belongs to payroll, later.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * A day's sheet (default) or one employee's history.
   *
   * 🔴 **مرشَّحةٌ بفروع القارئ عبر فرع الموظّف** (`ق-١٤٥٢` — قِيس: موظّفٌ مقيَّدٌ بالشمال كان يرى حضورَ موظّفي الجنوب):
   * سجلُّ الحضور لا يحمل فرعاً، ففرعُه فرعُ موظّفه — كتعديله وحذفه (`ق-١٤٤٠`).
   */
  list(companyId: string, allowedBranchIds: string[] | 'all', query?: ListAttendanceQueryDto) {
    const term = searchTerm(query);
    const where: Prisma.AttendanceRecordWhereInput = {
      ...(allowedBranchIds === 'all' ? {} : { employee: branchFilter(allowedBranchIds) as Prisma.EmployeeWhereInput }),
      ...(query?.date ? { date: new Date(query.date) } : {}),
      ...(query?.employeeId ? { employeeId: query.employeeId } : {}),
      // حقولُ البحث المُعلَنة (`ق-١٢٣٦`): الملاحظاتُ واسمُ الموظّف — والأخيرُ علاقةٌ فيُكتب هنا.
      ...(term ? { OR: [{ notes: { contains: term, mode: 'insensitive' } }, { employee: { fullName: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      pagedFindMany(query, tx.attendanceRecord, {
        where,
        include: RECORD_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
      }),
    );
  }

  record(companyId: string, allowedBranchIds: string[] | 'all', dto: RecordAttendanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // The id comes off a request body — re-check it belongs to this company.
      // 🔴 وبفروع الفاعل (توجيه ٢٧٥ · ق-١٥٧٨/ب — قِيس `201`): موظّفُ فرعٍ آخر غيرُ موجودٍ له، كتعديل الصفّ وحذفه (`ق-١٤٤٠`).
      const employee = await tx.employee.findFirst({ where: { id: dto.employeeId, ...branchFilter(allowedBranchIds) }, select: { id: true } });
      if (!employee) throw new NotFoundException(MSG.employee_not_found);

      const existing = await tx.attendanceRecord.findFirst({ where: { employeeId: dto.employeeId, date: new Date(dto.date) } });
      if (existing) throw new ConflictException(MSG.attendance_already_recorded);
      await assertAttendanceTimes(tx, companyId, new Date(dto.date), { checkIn: dto.checkIn }, [dto.checkIn]);

      return tx.attendanceRecord.create({
        data: {
          employeeId: dto.employeeId,
          date: new Date(dto.date),
          status: dto.status ?? 'PRESENT',
          checkIn: dto.checkIn,
          notes: dto.notes,
        } as unknown as Prisma.AttendanceRecordUncheckedCreateInput,
        include: RECORD_INCLUDE,
      });
    });
  }

  /**
   * 🔴 **صفُّ الحضور بفروع الفاعل — وفرعُه فرعُ موظّفه** (`ق-١٤٤٠`): `AttendanceRecord` بلا `branchId`، فيُرشَّح بعلاقة
   * `employee`. خارجُ الفروع **غيرُ موجودٍ له** (`404` لا `403`، فلا يُسرَّب وجودُه)، وموظّفُ المنشأة كلِّها مرئيٌّ للجميع.
   */
  private async findVisible(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', id: string) {
    const existing = await tx.attendanceRecord.findFirst({ where: { id, employee: branchFilter(allowedBranchIds) as Prisma.EmployeeWhereInput } });
    if (!existing) throw new NotFoundException(MSG.attendance_not_found);
    return existing;
  }

  /** Checkout time, a status correction, or a note — on the existing day row. */
  update(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateAttendanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الفرعُ قبل التعديل (`ق-١٤٤٠`): حضورُ موظّفِ فرعٍ آخر غيرُ موجودٍ للفاعل — `404` لا `403`.
      const existing = await this.findVisible(tx, allowedBranchIds, id);
      if (dto.checkIn !== undefined || dto.checkOut !== undefined) {
        const row = { checkIn: dto.checkIn ?? existing.checkIn, checkOut: dto.checkOut ?? existing.checkOut };
        await assertAttendanceTimes(tx, companyId, existing.date, row, [dto.checkIn, dto.checkOut]);
      }
      return tx.attendanceRecord.update({
        where: { id },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.checkIn !== undefined ? { checkIn: dto.checkIn } : {}),
          ...(dto.checkOut !== undefined ? { checkOut: dto.checkOut } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: RECORD_INCLUDE,
      });
    });
  }

  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الفرعُ قبل الحذف الصلب (`ق-١٤٤٠`): حضورُ موظّفِ فرعٍ آخر غيرُ موجودٍ للفاعل — `404` لا `403`.
      await this.findVisible(tx, allowedBranchIds, id);
      await tx.attendanceRecord.delete({ where: { id } });
    });
  }
}
