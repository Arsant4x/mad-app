import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Raw, unscoped Prisma client. Only ever used for:
 *  - platform-admin-level operations (managing companies, templates) that are
 *    intentionally not tenant-scoped, or
 *  - as the base client that TenantPrismaService extends per-request.
 *
 * Business modules must never query tenant-scoped tables through this
 * service directly — use TenantPrismaService.runInTenantContext instead.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
