import { readFileSync } from 'fs';
import { join } from 'path';
import { defaultUnitSerial, SOLUTION_NAME } from './egs-unit.util';

/**
 * `ق-١٦٩` — **تسلسليُّ الوحدة الافتراضية هو تسلسليُّ طلب الشهادة، من مصدرٍ واحد.**
 *
 * الخطر الذي يحرسه: صيغةٌ تُكتب في موضعين **تفترق بصمت** — فتحمل الشهادة `SN`
 * لا يطابق ما في الجدول، **والهيئة تقارن بينهما**. فالحارس يقرأ **مصدر** خدمة
 * الربط ويسقط إن عادت تكتب الصيغة بيدها.
 */
describe('وحدة الإصدار الافتراضية — مصدرٌ واحد للتسلسلي', () => {
  it('الصيغة `1-{الحل}|2-web|3-{المنشأة}` كما يقرؤها طلب الشهادة', () => {
    expect(defaultUnitSerial('c-123')).toBe(`1-${SOLUTION_NAME}|2-web|3-c-123`);
    expect(SOLUTION_NAME).toBe('mad-app');
  });

  it('🔴 وخدمة الربط لا تكتب الصيغة بيدها — تقرأها من المصدر', () => {
    const source = readFileSync(join(__dirname, 'zatca-onboarding.service.ts'), 'utf8');
    expect(source.length).toBeGreaterThan(1000); // قراءةٌ فاشلة تُسقط ولا تمرّ
    expect(source).toContain('defaultUnitSerial(companyId)');
    // الصيغة القديمة المكتوبة بيد — لو عادت افترق التسلسليّان.
    expect(source).not.toContain('|2-web|3-${companyId}');
    expect(source).not.toMatch(/const SOLUTION_NAME\s*=/);
  });

  it('🔴 وهجرة التعبئة تحمل الصيغة نفسها حرفياً — وإلا انفصل القائم عن الجديد', () => {
    const migration = readFileSync(join(__dirname, '..', '..', 'prisma', 'migrations', '20260905030000_egs_units', 'migration.sql'), 'utf8');
    expect(migration.length).toBeGreaterThan(500);
    // الهجرة SQL لا تستورد ثابتاً — فتُقارَن بنصّها: البادئة التي تركّب التسلسلي.
    expect(migration).toContain(`'1-${SOLUTION_NAME}|2-web|3-' || c."companyId"`);
  });
});
