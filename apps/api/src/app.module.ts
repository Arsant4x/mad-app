import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { BanksModule } from './banks/banks.module';
import { CompaniesModule } from './companies/companies.module';
import { CompanyUsersModule } from './company-users/company-users.module';
import { ContractsModule } from './contracts/contracts.module';
import { TenantPrismaModule } from './common/tenant/tenant-prisma.module';
import { CustomersModule } from './customers/customers.module';
import { EmployeesModule } from './employees/employees.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
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
import { TransactionsModule } from './transactions/transactions.module';
import { UnitsModule } from './units/units.module';
import { WarehousesModule } from './warehouses/warehouses.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantPrismaModule,
    AuthModule,
    AccountsModule,
    CustomersModule,
    InvoicesModule,
    SuppliersModule,
    PurchasesModule,
    ProductsModule,
    EmployeesModule,
    BanksModule,
    TransactionsModule,
    JournalModule,
    ReportsModule,
    PropertiesModule,
    UnitsModule,
    ContractsModule,
    WarehousesModule,
    InventoryModule,
    ObligationsModule,
    ReservationsModule,
    TemplatesModule,
    CompaniesModule,
    CompanyUsersModule,
    ScriptsModule,
  ],
})
export class AppModule {}
