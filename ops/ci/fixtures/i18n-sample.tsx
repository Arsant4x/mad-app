// Fixture for ops/ci/i18n-literals.test.mjs: a screen that still writes its text
// directly. It lives outside apps/web, so the gate never counts it.
export const Sample = () => (
  <section>
    <h2>تقرير المبيعات</h2>
    <input placeholder="Search" />
  </section>
);
