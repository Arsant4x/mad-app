import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';
import { pagedFindMany, searchTerm } from '../common/pagination/paged.util';
import { RecordAttendanceDto, UpdateAttendanceDto } from './dto/attendance.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';

const RECORD_INCLUDE = { employee: { select: { id: true, fullName: true } } } as const;

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

  /** A day's sheet (default) or one employee's history. */
  list(companyId: string, query?: ListAttendanceQueryDto) {
    const term = searchTerm(query);
    const where: Prisma.AttendanceRecordWhereInput = {
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

  record(companyId: string, dto: RecordAttendanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // The id comes off a request body — re-check it belongs to this company.
      const employee = await tx.employee.findUnique({ where: { id: dto.employeeId }, select: { id: true } });
      if (!employee) throw new NotFoundException(MSG.employee_not_found);

      const existing = await tx.attendanceRecord.findFirst({ where: { employeeId: dto.employeeId, date: new Date(dto.date) } });
      if (existing) throw new ConflictException(MSG.attendance_already_recorded);

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

  /** Checkout time, a status correction, or a note — on the existing day row. */
  update(companyId: string, id: string, dto: UpdateAttendanceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.attendance_not_found);
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

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.attendance_not_found);
      await tx.attendanceRecord.delete({ where: { id } });
    });
  }
}
