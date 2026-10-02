/**
 * ⚖️ **بطاقاتُ لوحة التحكم وشاشةُ كلٍّ منها** (توجيه ٢٧٥ · `ق-١٥٨٠`، بحكم صاحب المشروع): «**كلُّ بطاقةٍ لا تظهر إلا لمن يملك
 * شاشتَها، وأرقامُها من فروعه وحدَها**».
 *
 * **وشاشةُ البطاقة هي الشاشةُ التي يُقرأ فيها رقمُها كاملاً**: الإيرادُ والمصروفُ والصافي والسلسلةُ الشهرية سطورُ قائمة الدخل،
 * والذممُ مجموعُ تقرير الأعمار، وكلاهما في شاشة التقارير. فمن لا يملك `reports:view` لا يرى مختصرَها في اللوحة كما لا يرى
 * أصلَها. وبطاقةٌ جديدة تُضاف هنا بشاشتها، ولا تُعرض قبل أن تُضاف.
 *
 * والمفتاحُ يُبنى بـ`grant()` من `PermissionsService.forActor` في المتحكّم، فالأنشطةُ والتفويضُ داخلان فيه كما في الواجهة.
 */
export const DASHBOARD_CARD_SCREEN = {
  revenue: 'reports',
  expenses: 'reports',
  netProfit: 'reports',
  monthly: 'reports',
  receivables: 'reports',
} as const;

export type DashboardCard = keyof typeof DASHBOARD_CARD_SCREEN;

export const DASHBOARD_CARDS = Object.keys(DASHBOARD_CARD_SCREEN) as DashboardCard[];
