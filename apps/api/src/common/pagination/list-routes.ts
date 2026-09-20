/**
 * **نقاطُ القائمة التي تقبل الترقيمَ بالاختيار** (`ق-١٢٣٦`) — مقروءةُ الإرجاع واحدةً واحدة في موجز
 * `docs/موجز-طلبات-وكيل-الواجهة.md` (ملحق أ): مسارُ `GET` بلا وسيطٍ يعيد مصفوفةً عارية.
 *
 * القائمةُ **عقدٌ مُعلَن** لا اكتشافٌ آليّ: الحارسُ `list-routes-paged.spec.ts` يوجب على كلِّ مسارٍ فيها
 * أن يقبل `PagedQueryDto` في معالجه، والحارسُ الحيّ `paged-lists.e2e-spec.ts` يقرأ كلَّ مسارٍ منها
 * بلا `page` (مصفوفة) وبـ`page` (مغلَّف) وبـ`pageSize` وحدَه (`400`).
 *
 * والأربعةُ المرقَّمة قبلُ (`/contracts` · `/inventory/movements` · `/journal` · `/transactions`) ليست هنا:
 * عقدُها مغلَّفٌ دائماً ولا يتغيّر.
 */
export interface ListRoute {
  /** المسارُ كما يُطلب. */
  path: string;
  /** المتحكّمُ ومعالجُه — للحارس الساكن. */
  controller: string;
  handler: string;
  /** من يقرؤه: صاحبُ منشأةٍ أو مديرُ المنصّة. */
  actor: 'company' | 'platform';
  /** معاملاتٌ يوجبها المسارُ أصلاً (لا تخصّ الترقيم). */
  requiredQuery?: Record<string, string>;
}

export const LIST_ROUTES: readonly ListRoute[] = [
  { path: '/accounts', controller: 'accounts/accounts.controller.ts', handler: 'list', actor: 'company' },
  { path: '/activities', controller: 'activities/activities.controller.ts', handler: 'list', actor: 'company' },
  { path: '/admin/deletion-requests', controller: 'deletion-requests/deletion-requests.controller.ts', handler: 'list', actor: 'platform' },
  // `/admin/processing-agreement` ليس هنا: الموجزُ عدّه مصفوفةً لأن مصنِّفَه قرأ أوّلَ نداءِ خدمةٍ في المعالج
  // (`listSubProcessors` ⟵ `findMany`) لا ما يعيده — وهو يعيد كائناً `{ subProcessors, versions, acceptances, noticeDays }`.
  { path: '/attendance', controller: 'attendance/attendance.controller.ts', handler: 'list', actor: 'company' },
  { path: '/audit-log', controller: 'audit/audit.controller.ts', handler: 'list', actor: 'company' },
  { path: '/banks', controller: 'banks/banks.controller.ts', handler: 'list', actor: 'company' },
  { path: '/branches', controller: 'branches/branches.controller.ts', handler: 'list', actor: 'company' },
  { path: '/cash-drawers', controller: 'cash-drawers/cash-drawers.controller.ts', handler: 'list', actor: 'company' },
  { path: '/companies', controller: 'companies/companies.controller.ts', handler: 'list', actor: 'platform' },
  { path: '/company-users', controller: 'company-users/company-users.controller.ts', handler: 'list', actor: 'company' },
  { path: '/currencies', controller: 'currencies/currencies.controller.ts', handler: 'list', actor: 'company' },
  { path: '/currencies/rates', controller: 'currencies/currencies.controller.ts', handler: 'listRates', actor: 'company' },
  { path: '/customers', controller: 'customers/customers.controller.ts', handler: 'list', actor: 'company' },
  { path: '/employees', controller: 'employees/employees.controller.ts', handler: 'list', actor: 'company' },
  { path: '/fiscal-years', controller: 'fiscal/fiscal.controller.ts', handler: 'list', actor: 'company' },
  { path: '/integrations', controller: 'integrations/integrations.controller.ts', handler: 'list', actor: 'company' },
  { path: '/inventory/provisional', controller: 'inventory/inventory.controller.ts', handler: 'provisional', actor: 'company' },
  { path: '/inventory/stock-levels', controller: 'inventory/inventory.controller.ts', handler: 'stockLevels', actor: 'company' },
  { path: '/inventory/write-offs', controller: 'inventory/inventory.controller.ts', handler: 'listWriteOffs', actor: 'company' },
  { path: '/invoices', controller: 'invoices/invoices.controller.ts', handler: 'list', actor: 'company' },
  { path: '/leaves/requests', controller: 'leaves/leaves.controller.ts', handler: 'listRequests', actor: 'company' },
  { path: '/leaves/types', controller: 'leaves/leaves.controller.ts', handler: 'listTypes', actor: 'company' },
  { path: '/maintenance', controller: 'maintenance/maintenance.controller.ts', handler: 'list', actor: 'company' },
  { path: '/obligations', controller: 'obligations/obligations.controller.ts', handler: 'list', actor: 'company' },
  { path: '/payments', controller: 'payments/payments.controller.ts', handler: 'list', actor: 'company' },
  { path: '/pos/shifts', controller: 'pos/pos.controller.ts', handler: 'listShifts', actor: 'company' },
  { path: '/products', controller: 'products/products.controller.ts', handler: 'list', actor: 'company' },
  { path: '/properties', controller: 'properties/properties.controller.ts', handler: 'list', actor: 'company' },
  { path: '/quotes', controller: 'quotes/quotes.controller.ts', handler: 'list', actor: 'company' },
  { path: '/reservations', controller: 'reservations/reservations.controller.ts', handler: 'list', actor: 'company' },
  { path: '/scripts', controller: 'scripts/scripts.controller.ts', handler: 'list', actor: 'company' },
  { path: '/supplier-payments', controller: 'purchases/supplier-payments.controller.ts', handler: 'list', actor: 'company' },
  { path: '/suppliers', controller: 'suppliers/suppliers.controller.ts', handler: 'list', actor: 'company' },
  { path: '/support-access', controller: 'support-access/support-access.controller.ts', handler: 'overview', actor: 'company' },
  { path: '/support-access/admin', controller: 'support-access/support-access.controller.ts', handler: 'list', actor: 'platform' },
  { path: '/support-access/log', controller: 'support-access/support-access.controller.ts', handler: 'log', actor: 'company' },
  { path: '/tasks/mine', controller: 'tasks/tasks.controller.ts', handler: 'mine', actor: 'company' },
  { path: '/templates', controller: 'templates/templates.controller.ts', handler: 'list', actor: 'company' },
  { path: '/units', controller: 'units/units.controller.ts', handler: 'list', actor: 'company' },
  { path: '/warehouses', controller: 'warehouses/warehouses.controller.ts', handler: 'list', actor: 'company' },
  { path: '/warranties', controller: 'warranties/warranties.controller.ts', handler: 'list', actor: 'company' },
  { path: '/warranties/cover', controller: 'warranties/warranties.controller.ts', handler: 'cover', actor: 'company', requiredQuery: { propertyId: '<property>' } },
];
