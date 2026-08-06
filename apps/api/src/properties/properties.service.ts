import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { MSG } from '../common/i18n/messages';

@Injectable()
export class PropertiesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.property.findMany({ orderBy: { name: 'asc' } }));
  }

  create(companyId: string, dto: CreatePropertyDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.property.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          address: dto.address,
          floors: dto.floors ?? 1,
          activityType: dto.activityType,
          activitySubtype: dto.activitySubtype,
          ownership: dto.ownership,
          leaseValue: dto.leaseValue,
          leaseCycle: dto.leaseCycle,
          leaseStart: dto.leaseStart ? new Date(dto.leaseStart) : undefined,
          leaseEnd: dto.leaseEnd ? new Date(dto.leaseEnd) : undefined,
          opRate: dto.opRate,
          deedNo: dto.deedNo,
          lat: dto.lat,
          lng: dto.lng,
        } as unknown as Prisma.PropertyCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdatePropertyDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.property.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.property_not_found);

      const data: Prisma.PropertyUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.address !== undefined) data.address = dto.address;
      if (dto.floors !== undefined) data.floors = dto.floors;
      if (dto.activityType !== undefined) data.activityType = dto.activityType;
      if (dto.activitySubtype !== undefined) data.activitySubtype = dto.activitySubtype;
      if (dto.ownership !== undefined) data.ownership = dto.ownership;
      if (dto.leaseValue !== undefined) data.leaseValue = dto.leaseValue;
      if (dto.leaseCycle !== undefined) data.leaseCycle = dto.leaseCycle;
      if (dto.leaseStart !== undefined) data.leaseStart = new Date(dto.leaseStart);
      if (dto.leaseEnd !== undefined) data.leaseEnd = new Date(dto.leaseEnd);
      if (dto.opRate !== undefined) data.opRate = dto.opRate;
      if (dto.deedNo !== undefined) data.deedNo = dto.deedNo;
      if (dto.lat !== undefined) data.lat = dto.lat;
      if (dto.lng !== undefined) data.lng = dto.lng;

      return tx.property.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.property.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.property_not_found);
      try {
        await tx.property.delete({ where: { id } });
      } catch (e) {
        // P2003 = foreign key violation — units.propertyId is ON DELETE
        // RESTRICT, so this fires when the property still has units.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          throw new ConflictException(MSG.property_has_units);
        }
        throw e;
      }
    });
  }
}
