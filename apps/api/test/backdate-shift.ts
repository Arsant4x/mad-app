import { INestApplication } from '@nestjs/common';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';

/**
 * A synced offline sale must be rung after its shift opened. Suites that sync sales rung at fixed past instants open
 * their shift now, so they move its opening back to before those instants.
 */
export async function backdateShiftOpening(app: INestApplication, companyId: string, shiftIds: string[], openedAt: Date): Promise<void> {
  const moved = await app
    .get(TenantPrismaService)
    .runInTenantContext(companyId, (tx) => tx.posShift.updateMany({ where: { id: { in: shiftIds } }, data: { openedAt } }));
  if (moved.count !== shiftIds.length) throw new Error(`moved ${moved.count} of ${shiftIds.length} shifts`);
}
