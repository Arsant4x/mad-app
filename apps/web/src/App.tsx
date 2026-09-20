import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PermissionsProvider } from './auth/PermissionsContext';
import { RoleAwareIndex } from './layout/RoleAwareIndex';
import { RootShell } from './layout/RootShell';
import { AccountsPage } from './pages/accounts/AccountsPage';
import { BanksPage } from './pages/banks/BanksPage';
import { BranchesPage } from './pages/branches/BranchesPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { CompanyProfilePage } from './pages/companyProfile/CompanyProfilePage';
import { SubscriptionPage } from './pages/subscription/SubscriptionPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { DelegationLogPage } from './pages/audit/DelegationLogPage';
import { MyTasksPage } from './pages/tasks/MyTasksPage';
import { TrashPage } from './pages/trash/TrashPage';
import { CompanyUsersPage } from './pages/companyUsers/CompanyUsersPage';
import { ContractsPage } from './pages/contracts/ContractsPage';
import { ContractsListPage } from './pages/contracts/ContractsListPage';
import { MaintenancePage } from './pages/maintenance/MaintenancePage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { RemindersPage } from './pages/reminders/RemindersPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { FiscalPage } from './pages/fiscal/FiscalPage';
import { EmployeesPage } from './pages/employees/EmployeesPage';
import { HrPage } from './pages/hr/HrPage';
import { StockLevelsPage } from './pages/inventory/StockLevelsPage';
import { StockMovementsPage } from './pages/inventory/StockMovementsPage';
import { ExpiringStockPage } from './pages/inventory/ExpiringStockPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { PosPage } from './pages/pos/PosPage';
import { QuotesPage } from './pages/quotes/QuotesPage';
import { JournalPage } from './pages/journal/JournalPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ObligationsPage } from './pages/obligations/ObligationsPage';
import { VatDeclarationPage } from './pages/obligations/VatDeclarationPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { PropertiesPage } from './pages/properties/PropertiesPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { ScriptsPage } from './pages/scripts/ScriptsPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { IncorporationReportPage } from './pages/suppliers/IncorporationReportPage';
import { TransactionsPage } from './pages/transactions/TransactionsPage';
import { UnitsPage } from './pages/units/UnitsPage';
import { WarehousesPage } from './pages/warehouses/WarehousesPage';
import { WarrantiesPage } from './pages/warranties/WarrantiesPage';
import { CompanyOwnerGuard } from './routes/CompanyOwnerGuard';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ScreenGuard } from './routes/ScreenGuard';

export default function App() {
  return (
    <AuthProvider>
      {/* ⚠️ `PermissionsProvider` **داخل** الموجّه: يعيد الجلب عند كل تنقّل،
        * فيحتاج `useLocation`. وخارجَه لا يرى التنقّل — فتبقى الصلاحيات
        * مثبَّتةً على أول تحميل، وهو ما يمنعه الشرط. */}
      <BrowserRouter>
        <PermissionsProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RootShell />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <ScreenGuard screen="dashboard">
                  <RoleAwareIndex />
                </ScreenGuard>
              }
            />
            <Route path="company-profile" element={<CompanyProfilePage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route
              path="audit-log"
              element={
                <ScreenGuard screen="audit">
                  <AuditLogPage />
                </ScreenGuard>
              }
            />
            <Route
              path="trash"
              element={
                <ScreenGuard screen="audit">
                  <TrashPage />
                </ScreenGuard>
              }
            />
            {/* ⚠️ `audit` — **مطابقةً للخادم حرفياً**: `DelegationsController.log`
              * يحمل `@RequiresScreen('audit')` يَجُبّ شاشة الصنف. وحارسٌ في
              * الواجهة يخالف الخادم يُنتج أسوأ الحالتين: رابطٌ يظهر وصفحةٌ
              * ترفض، أو العكس.
              *
              * والتطابق **محروسٌ لا موصوف**: `guardsMatchServer.test.ts` يقرأ
              * هذا الملف ومتحكّم الخادم معاً ويقارنهما. */}
            <Route
              path="delegation-log"
              element={
                <ScreenGuard screen="audit">
                  <DelegationLogPage />
                </ScreenGuard>
              }
            />
            {/* ⚠️ بلا `ScreenGuard` — **مطابقةً للخادم**: `TasksController`
              * بلا `@RequiresScreen`. و«مهامي» يقرأ ما كُلِّف به الفاعل نفسه،
              * فحارسُ شاشةٍ يمنع موظفاً محدود الصلاحية من رؤية ما كُلِّف به —
              * وهو نقيض الغرض: المهمة تُسنَد إليه بالضبط لأنه لا يملك الشاشة.
              * ونظيرُه القائم: `notifications`. */}
            <Route path="my-tasks" element={<MyTasksPage />} />
            <Route
              path="company-users"
              element={
                <CompanyOwnerGuard>
                  <CompanyUsersPage />
                </CompanyOwnerGuard>
              }
            />
            <Route
              path="accounts"
              element={
                <ScreenGuard screen="accounts">
                  <AccountsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="branches"
              element={
                <ScreenGuard screen="branches">
                  <BranchesPage />
                </ScreenGuard>
              }

            />

            <Route
              path="settings"
              element={
                <ScreenGuard screen="settings">
                  <SettingsPage />
                </ScreenGuard>
              }
            />

            <Route
              path="fiscal"
              element={
                <ScreenGuard screen="fiscal">
                  <FiscalPage />
                </ScreenGuard>
              }

            />

            <Route
              path="journal"
              element={
                <ScreenGuard screen="journal">
                  <JournalPage />
                </ScreenGuard>
              }
            />
            <Route
              path="properties"
              element={
                <ScreenGuard screen="properties">
                  <PropertiesPage />
                </ScreenGuard>
              }
            />
            <Route
              path="units"
              element={
                <ScreenGuard screen="properties">
                  <UnitsPage />
                </ScreenGuard>
              }
            />
            {/* الشريطُ الرفيع (docs/ui/rounds/03): القائمةُ والبطاقةُ على القواعد الخمس.
                والشاشةُ القديمة تبقى على `contracts/legacy` — الإنشاءُ والودائعُ والمطالباتُ
                والتسليمُ ما زالت عليها، ولا تُحذف قبل حكم المالك (§٤ من التوجيه). */}
            <Route
              path="contracts"
              element={
                <ScreenGuard screen="contracts">
                  <ContractsListPage />
                </ScreenGuard>
              }
            />
            <Route
              path="contracts/legacy"
              element={
                <ScreenGuard screen="contracts">
                  <ContractsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="reminders"
              element={
                <ScreenGuard screen="contracts">
                  <RemindersPage />
                </ScreenGuard>
              }
            />
            {/* No ScreenGuard, matching the backend: notifications are already
                filtered to their recipient, so a second gate would only hide a
                manager's own escalations from them. */}
            <Route path="notifications" element={<NotificationsPage />} />
            <Route
              path="maintenance"
              element={
                <ScreenGuard screen="maintenance">
                  <MaintenancePage />
                </ScreenGuard>
              }
            />
            <Route
              path="warranties"
              element={
                <ScreenGuard screen="maintenance">
                  <WarrantiesPage />
                </ScreenGuard>
              }
            />
            <Route
              path="pos"
              element={
                <ScreenGuard screen="pos">
                  <PosPage />
                </ScreenGuard>
              }
            />
            <Route
              path="quotes"
              element={
                <ScreenGuard screen="quotes">
                  <QuotesPage />
                </ScreenGuard>
              }
            />
            <Route
              path="invoices"
              element={
                <ScreenGuard screen="invoice">
                  <InvoicesPage />
                </ScreenGuard>
              }
            />
            <Route
              path="payments"
              element={
                <ScreenGuard screen="payments">
                  <PaymentsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="customers"
              element={
                <ScreenGuard screen="customers">
                  <CustomersPage />
                </ScreenGuard>
              }
            />
            <Route
              path="suppliers"
              element={
                <ScreenGuard screen="suppliers">
                  <SuppliersPage />
                </ScreenGuard>
              }
            />
            <Route
              path="incorporation-report"
              element={
                <ScreenGuard screen="suppliers">
                  <IncorporationReportPage />
                </ScreenGuard>
              }
            />
            <Route
              path="products"
              element={
                <ScreenGuard screen="products">
                  <ProductsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="employees"
              element={
                <ScreenGuard screen="employees">
                  <EmployeesPage />
                </ScreenGuard>
              }
            />
            <Route
              path="hr"
              element={
                <ScreenGuard screen="employees">
                  <HrPage />
                </ScreenGuard>
              }
            />
            <Route
              path="banks"
              element={
                <ScreenGuard screen="banks">
                  <BanksPage />
                </ScreenGuard>
              }
            />
            <Route
              path="transactions"
              element={
                <ScreenGuard screen="transactions">
                  <TransactionsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="reports"
              element={
                <ScreenGuard screen="reports">
                  <ReportsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="warehouses"
              element={
                <ScreenGuard screen="inventory">
                  <WarehousesPage />
                </ScreenGuard>
              }
            />
            <Route
              path="stock-levels"
              element={
                <ScreenGuard screen="inventory">
                  <StockLevelsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="stock-movements"
              element={
                <ScreenGuard screen="inventory">
                  <StockMovementsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="expiring"
              element={
                <ScreenGuard screen="inventory">
                  <ExpiringStockPage />
                </ScreenGuard>
              }
            />
            <Route
              path="obligations"
              element={
                <ScreenGuard screen="obligations">
                  <ObligationsPage />
                </ScreenGuard>
              }
            />
            <Route
              path="obligations/vat-declaration"
              element={
                <ScreenGuard screen="obligations">
                  <VatDeclarationPage />
                </ScreenGuard>
              }
            />
            <Route
              path="scripts"
              element={
                <ScreenGuard screen="scripts">
                  <ScriptsPage />
                </ScreenGuard>
              }
            />
          </Route>
        </Routes>
        </PermissionsProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
