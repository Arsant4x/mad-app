import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.employee.findMany({ orderBy: { fullName: 'asc' } }));
  }

  create(companyId: string, dto: CreateEmployeeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.employee.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          fullName: dto.fullName,
          jobTitle: dto.jobTitle || null,
          department: dto.department || null,
          hireDate: new Date(dto.hireDate),
          baseSalary: dto.baseSalary ?? 0,
          phone: dto.phone || null,
          status: dto.status ?? 'ACTIVE',
        } as unknown as Prisma.EmployeeCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateEmployeeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الموظف غير موجود');

      const data: Prisma.EmployeeUncheckedUpdateInput = {};
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle || null;
      if (dto.department !== undefined) data.department = dto.department || null;
      if (dto.hireDate !== undefined) data.hireDate = new Date(dto.hireDate);
      if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.status !== undefined) data.status = dto.status;

      return tx.employee.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('الموظف غير موجود');
      await tx.employee.delete({ where: { id } });
    });
  }
}
