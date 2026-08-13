import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { BanksModule } from './banks/banks.module';
import { CompaniesModule } from './companies/companies.module';
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
import { CurrenciesModule } from './currencies/currencies.module';
import { ZatcaModule } from './zatca/zatca.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { NotificationsModule } from './notifications/notifications.module';
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
    ScheduleModule.forRoot(),
    // Flood protection: a generous global ceiling (normal use never hits it),
    // with a much stricter per-route limit on login (see AuthController) so
    // password guessing is throttled hard. Skipped entirely under Jest — the
    // e2e suite fires hundreds of requests from one IP by design, and rate
    // limiting is not the behaviour those tests exist to verify.
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 600, ttl: 60_000 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    TenantPrismaModule,
    MailModule,
    AuditModule,
    TrashModule,
    DeletionRequestsModule,
    ExportModule,
    AuthModule,
    AccountsModule,
    CustomersModule,
    InvoicesModule,
    PaymentsModule,
    MaintenanceModule,
    NotificationsModule,
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
    CompaniesModule,
    CompanyUsersModule,
    ScriptsModule,
    FiscalModule,
    BranchesModule,
    ActivitiesModule,
    CurrenciesModule,
    ZatcaModule,
    CompanyProfileModule,
    FilesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
