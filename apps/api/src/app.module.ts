import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { tenantTracker } from './common/throttle/tenant-tracker';
import { BanksModule } from './banks/banks.module';
import { CompaniesModule } from './companies/companies.module';
import { PlatformModule } from './platform/platform.module';
import { HealthModule } from './common/health/health.module';
import { MfaModule } from './common/mfa/mfa.module';
import { CompanyProfileModule } from './company-profile/company-profile.module';
import { CompanyUsersModule } from './company-users/company-users.module';
import { ContractsModule } from './contracts/contracts.module';
import { TenantPrismaModule } from './common/tenant/tenant-prisma.module';
import { CustomersModule } from './customers/customers.module';
import { EmployeesModule } from './employees/employees.module';
import { LeavesModule } from './leaves/leaves.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PosModule } from './pos/pos.module';
import { QuotesModule } from './quotes/quotes.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SupportAccessModule } from './support-access/support-access.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './common/mail/mail.module';
import { TrashModule } from './trash/trash.module';
import { DeletionRequestsModule } from './deletion-requests/deletion-requests.module';
import { ExportModule } from './export/export.module';
import { FilesModule } from './files/files.module';
import { ActivitiesModule } from './activities/activities.module';
import { BranchesModule } from './branches/branches.module';
import { CashDrawersModule } from './cash-drawers/cash-drawers.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { ZatcaModule } from './zatca/zatca.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { OutboxModule } from './outbox/outbox.module';
import { PaymentsModule } from './payments/payments.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConsentModule } from './consent/consent.module';
import { RemindersModule } from './reminders/reminders.module';
import { JournalModule } from './journal/journal.module';
import { ObligationsModule } from './obligations/obligations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PropertiesModule } from './properties/properties.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ScriptsModule } from './scripts/scripts.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TemplatesModule } from './templates/templates.module';
import { PermissionsModule } from './delegations/permissions.module';
import { TasksModule } from './tasks/tasks.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UnitsModule } from './units/units.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { WarrantiesModule } from './warranties/warranties.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Runs the daily escalation sweep in-process. Safe under multiple
    // instances because every notification it raises is deduplicated by a
    // unique key — see EscalationService.
    //
    // ⚠️ **ومعطَّلٌ تحت الاختبار** (`ق-٢٩٢`): `OutboxDispatcherJob` يعمل **كل
    // دقيقة** ويرسل فواتير ZATCA، **فيلتهم `icv` بين توكيدٍ وسابقه** — وهو ما
    // أسقط `db-integration` على طلبٍ لا عطلَ فيه. **والمقيس: ٥١ توكيداً
    // نسبياً في ٢٦ ملفاً**، خمسةٌ منها مكشوفةٌ لهذه المهمة، **ومهمّتان
    // يوميّتان مكشوفتان بالساعة** (٣ص · ٧ص) — وCI يعمل في كل ساعة.
    //
    // **والعزلُ رُفض بنيةً لا انضباطاً** (حكم المالك): يُصلح خمسةً ويترك
    // التزاماً دائماً على كل اختبارٍ يُكتب بعد اليوم، **ولا يُصلح انكشافَ
    // الساعة أصلاً**. ولا اختبارَ يفقد شيئاً: الترقيةُ تُستدعى بـ
    // `POST /notifications/run-escalation`، والصندوقُ الصادر بدوالّه مباشرةً.
    //
    // ⚠️ **وحارسٌ يمنع أن يصير التعطيلُ نسياناً**:
    // `src/common/scheduler-registered.spec.ts` يثبت أن التسجيل قائمٌ وأن
    // بوّابتَه **بيئةُ الاختبار وحدها** — فمهمّةٌ لا تعمل في الإنتاج أسوأ من
    // اختبارٍ متقلّب.
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
    // Flood protection: a generous global ceiling (normal use never hits it),
    // with a much stricter per-route limit on login (see AuthController) so
    // password guessing is throttled hard. Skipped entirely under Jest — the
    // e2e suite fires hundreds of requests from one IP by design, and rate
    // limiting is not the behaviour those tests exist to verify.
    //
    // **والمفتاحُ بالمنشأة والمستخدم، والعنوانُ للمجهول وحدَه** (`ق-١٢٧١`/ب): كان العنوانَ للجميع، فمنشأتان
    // خلف عنوانٍ واحد كانت تحجب إحداهما الأخرى — `tenantTracker` يقرأ هويّةَ الطالب من رمزه بتوقيعه.
    ThrottlerModule.forRootAsync({
      imports: [AuthModule],
      inject: [JwtService],
      useFactory: (jwt: JwtService) => ({
        throttlers: [{ limit: 600, ttl: 60_000 }],
        skipIf: () => process.env.NODE_ENV === 'test',
        getTracker: tenantTracker(jwt),
      }),
    }),
    PrismaModule,
    TenantPrismaModule,
    MailModule,
    AuditModule,
    TrashModule,
    DeletionRequestsModule,
    ExportModule,
    // ⚠️ **قبل `AuthModule`**: `JwtAuthGuard` فيه يعتمد على `ApiKeysService`، والوحدةُ
    //    عامّة — فتسجيلُها أوّلاً يجعلها متاحةً لكلّ من يستعمل الحارس (ي/⑫A3).
    ApiKeysModule,
    AuthModule,
    AccountsModule,
    CustomersModule,
    InvoicesModule,
    OutboxModule,
    PaymentsModule,
    MaintenanceModule,
    NotificationsModule,
    ConsentModule,
    RemindersModule,
    SuppliersModule,
    PurchasesModule,
    ProductsModule,
    EmployeesModule,
    LeavesModule,
    AttendanceModule,
    PosModule,
    QuotesModule,
    IntegrationsModule,
    SupportAccessModule,
    SubscriptionModule,
    BanksModule,
    TransactionsModule,
    JournalModule,
    ReportsModule,
    PropertiesModule,
    UnitsModule,
    ContractsModule,
    WarehousesModule,
    WarrantiesModule,
    InventoryModule,
    ObligationsModule,
    ReservationsModule,
    TemplatesModule,
    PermissionsModule,
    TasksModule,
    // قراراتُ المنصّة الحرجة (`ق-١٣١٨` · ⑪A1) — **قبل مستهلكيها**: الحذفُ والاشتراك.
    PlatformModule,
    // شقُّ الصحّة (`ق-١٣١٨` · ⑪A3) — **مكشوفٌ بلا مصادقة** كي ينفع فحصَ الحاوية.
    HealthModule,
    // المصادقةُ المتعدّدة (`ق-١٣١٨` · ⑨A1) — **قبل `AuthModule`**: مسارُ الدخول يستهلكها.
    MfaModule,
    CompaniesModule,
    CompanyUsersModule,
    ScriptsModule,
    FiscalModule,
    BranchesModule,
    CashDrawersModule,
    ActivitiesModule,
    CurrenciesModule,
    ZatcaModule,
    CompanyProfileModule,
    FilesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
