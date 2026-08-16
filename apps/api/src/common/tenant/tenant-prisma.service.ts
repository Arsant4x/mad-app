import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantScopeExtension } from './tenant-scope.extension';

@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `work` inside a single DB transaction that is scoped to `companyId`
   * on two independent layers:
   *  1. Every query against a tenant-scoped model automatically gets
   *     `companyId` merged into its `where`/`data` (tenantScopeExtension).
   *  2. `set_config('app.company_id', ...)` is set for the transaction, which
   *     Postgres RLS policies use to reject any row that doesn't match —
   *     even if a query somehow skipped layer 1 (e.g. raw SQL).
   *
   * `set_config` is used (not `SET LOCAL app.company_id = ...`) because it
   * accepts a bound parameter — string-interpolating `companyId` into raw SQL
   * would be an injection risk even though it's a server-generated UUID.
   *
   * `work` is typed against the stable, exported `Prisma.TransactionClient`
   * rather than the extended client's own (unstable/unexported) type — the
   * runtime object passed in is a strict superset of that interface, so the
   * cast below is safe. Prisma's extension type system doesn't currently
   * expose a clean way to carry the exact extended type across a function
   * boundary like this.
   */
  /**
   * ⚠️ `options` تصل إلى `$transaction` **لا إلى جسد المعاملة** — وهذا شرطُ
   * صحّتها لا تفصيلة أسلوب.
   *
   * `SET TRANSACTION ISOLATION LEVEL` يجب أن يسبق **أي** استعلام، وهذه الدالة
   * تُنفّذ `set_config` أول شيء. فطلبُ اللقطة من داخل الجسد يردّه Postgres —
   * مقيسٌ لا مفترَض:
   *
   *     BEGIN; SELECT set_config(…); SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
   *     ⇒ ERROR: SET TRANSACTION ISOLATION LEVEL must be called before any query
   *
   * فتُمرَّر إلى Prisma لتُضبط عند `BEGIN` نفسه. **والفرق ليس شكلياً**: مستدعٍ
   * يطلب لقطةً ولا يحصل عليها يبني ضمانةً على وهم — وقد كاد يقع هنا: بيان
   * التصدير كان سيُعلن `isolation: 'REPEATABLE READ'` ولا لقطة أصلاً.
   */
  async runInTenantContext<T>(
    companyId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number },
  ): Promise<T> {
    const scoped = this.prisma.$extends(tenantScopeExtension(companyId));
    return scoped.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return work(tx as unknown as Prisma.TransactionClient);
    }, options);
  }
}
