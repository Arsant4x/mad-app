import { defineConfig, devices } from '@playwright/test';

/**
 * اختبارات المتصفح — ثلاثة عروض، بلا لقطات بصرية (قرار المالك 2026-08-10).
 *
 * **لماذا بلا لقطات:** اللقطة تسقط عند تغيير ظلٍّ أو خط، فتُدرَّب الفرقة على
 * قبول السقوط وتحديث الأساس بلا نظر — فيتحوّل الحارس إلى ضجيج. التوكيدات هنا
 * على **البنية والسلوك**: هل ابتلع الشريط المحتوى؟ هل يُمرَّر الجدول؟ هل
 * ظهرت الرسالة؟ — وهي أسئلة لها جواب واحد لا يتغيّر بتغيّر الشكل.
 *
 * **العروض الثلاثة** ليست اعتباطاً: 375 أضيق جوال شائع · 768 حدّ اللوحي ·
 * 1280 سطح المكتب. والعطل الذي وُلد منه هذا الملف (الشريط 250px غير قابل
 * للانكماش يترك 125px للمحتوى) لا يظهر إلا في الأول.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // منشأة اختبار واحدة لكل تشغيل (قرار المالك) — تُسجَّل هنا وتُحذف في
  // التفكيك، فلا تتكرر لكل مجموعة وعرض وترتدّ بحدّ المعدّل.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // التوازي مطفأ: الاختبارات تسجّل منشأة حقيقية على خادم واحد، والتوازي
  // يجعل تشخيص أي سقوط تخميناً — أيّ تشغيلٍ خلّف أي بيانات؟
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE,
    locale: 'ar-SA',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  // خادم تطوير داخل CI (قرار المالك): معزول، ولا يربط الحزمة بخادمٍ يُمحى.
  // والتشغيل اليدوي على البيئة المنشورة يبقى إجراءً موثَّقاً قبل كل نشر —
  // فما يُختبر هنا هو الشيفرة، وما يُختبر هناك هو النشر، وهما ليسا نفس الشيء.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
