import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RoleAwareIndex } from './layout/RoleAwareIndex';
import { RootShell } from './layout/RootShell';
import { AccountsPage } from './pages/accounts/AccountsPage';
import { BanksPage } from './pages/banks/BanksPage';
import { BranchesPage } from './pages/branches/BranchesPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { CompanyProfilePage } from './pages/companyProfile/CompanyProfilePage';
import { SubscriptionPage } from './pages/subscription/SubscriptionPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { CompanyUsersPage } from './pages/companyUsers/CompanyUsersPage';
import { ContractsPage } from './pages/contracts/ContractsPage';
import { MaintenancePage } from './pages/maintenance/MaintenancePage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { RemindersPage } from './pages/reminders/RemindersPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { FiscalPage } from './pages/fiscal/FiscalPage';
import { EmployeesPage } from './pages/employees/EmployeesPage';
import { LeavesPage } from './pages/leaves/LeavesPage';
import { StockLevelsPage } from './pages/inventory/StockLevelsPage';
import { StockMovementsPage } from './pages/inventory/StockMovementsPage';
import { ExpiringStockPage } from './pages/inventory/ExpiringStockPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { JournalPage } from './pages/journal/JournalPage';
import { LoginPage } from './pages/LoginPage';
import { ObligationsPage } from './pages/obligations/ObligationsPage';
import { VatDeclarationPage } from './pages/obligations/VatDeclarationPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { PropertiesPage } from './pages/properties/PropertiesPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { ScriptsPage } from './pages/scripts/ScriptsPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { TransactionsPage } from './pages/transactions/TransactionsPage';
import { UnitsPage } from './pages/units/UnitsPage';
import { WarehousesPage } from './pages/warehouses/WarehousesPage';
import { CompanyOwnerGuard } from './routes/CompanyOwnerGuard';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ScreenGuard } from './routes/ScreenGuard';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route
              path="contracts"
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
              path="invoices"
              element={
                <ScreenGuard screen="invoice">
                  <InvoicesPage />
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
              path="leaves"
              element={
                <ScreenGuard screen="employees">
                  <LeavesPage />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
