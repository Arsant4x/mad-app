import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MSG } from '../common/i18n/messages';

/** Matches the original mockup's genBarcode(): a 12-digit, EAN-13-shaped
 * numeric string derived from the current timestamp. Not guaranteed globally
 * unique (same as the mockup) — good enough for a picklist barcode, not a
 * real inventory system. */
function generateBarcode(): string {
  return '2' + Date.now().toString().slice(-11);
}

@Injectable()
export class ProductsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.product.findMany({ orderBy: { name: 'asc' } }));
  }

  create(companyId: string, dto: CreateProductDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.product.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          name: dto.name,
          sku: dto.sku || null,
          category: dto.category || null,
          unit: dto.unit || null,
          price: dto.price ?? 0,
          cost: dto.cost ?? 0,
          minStock: dto.minStock ?? 0,
          barcode: dto.barcode || generateBarcode(),
        } as unknown as Prisma.ProductCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateProductDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.product_not_found);

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.sku !== undefined) data.sku = dto.sku || null;
      if (dto.category !== undefined) data.category = dto.category || null;
      if (dto.unit !== undefined) data.unit = dto.unit || null;
      if (dto.price !== undefined) data.price = dto.price;
      if (dto.cost !== undefined) data.cost = dto.cost;
      if (dto.minStock !== undefined) data.minStock = dto.minStock;
      if (dto.barcode !== undefined) data.barcode = dto.barcode || existing.barcode;

      return tx.product.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.product_not_found);
      await tx.product.delete({ where: { id } });
    });
  }
}
