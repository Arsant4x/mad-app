import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * اختبارات المكوّنات — منفصلة عن vite.config.ts عمداً.
 *
 * دمجُهما يجعل كل بناءِ إنتاجٍ يحمل تهيئة اختبار لا يحتاجها، ويخلط مسؤوليتين
 * تتغيّران لأسبابٍ مختلفة.
 *
 * النطاق هنا **الوحدات والمكوّنات وحدها** — ما يمكن الحكم عليه داخل jsdom بلا
 * متصفح ولا خادم. أما ما يلزمه تخطيطٌ حقيقي أو دورةُ طلبٍ كاملة فمكانه
 * Playwright (`e2e/`)، لأن jsdom **لا ينفّذ تخطيطاً**: لا عرض عنصر ولا
 * استعلام وسائط ولا تمرير. اختبارُ استجابةٍ في jsdom يمرّ دائماً ولا يعني شيئاً.
 */
export default defineConfig({
  plugins: [react()],
  // JSX التلقائي مُصرَّحٌ به هنا لا مأخوذاً من tsconfig: ملفات الاختبار
  // مستثناة من tsconfig.app.json (لئلا تدخل بناء الإنتاج)، فتفقد إعداد
  // `jsx: react-jsx` معه وينهار التحويل بـ«React is not defined».
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ لبلايرايت لا لـvitest — تشغيلها هنا يُسقطها بلا معنى.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    restoreMocks: true,
  },
});
