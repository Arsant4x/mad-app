import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetPrimaryActivityDto } from './dto/set-primary-activity.dto';

const read = (...p: string[]) =>
  readFileSync(join(__dirname, ...p), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const service = () => read('primary-activity.service.ts');
const controller = () => read('activities.controller.ts');

/** جسم دالةٍ بعينها — **لا الملف كله**. */
function bodyOf(src: string, signature: string): string {
  const at = src.indexOf(signature);
  expect({ signature, found: at > -1 }).toEqual({ signature, found: true });
  return src.slice(at, src.indexOf('\n  }', at));
}

describe('اختيار النشاط الرئيسي — الشروط الثلاثة', () => {
  it('يقرأ الملفات فعلاً', () => {
    expect(service().length).toBeGreaterThan(1500);
    expect(controller().length).toBeGreaterThan(800);
  });

  it('⭐① التغيير يُسجَّل في سجل التدقيق — وبالأسماء لا بالمعرّفات', () => {
    // يغيّر ما يراه **كل موظف**، لا المالك وحده. وتغييرٌ بهذا الأثر بلا
    // أثرٍ مكتوب يترك «لماذا اختفت شاشتي؟» بلا جواب.
    const body = bodyOf(service(), 'async apply(');
    expect(body).toContain('this.audit.record');
    expect(body).toMatch(/hidden:.*SCREEN_LABELS/);
    expect(body).toMatch(/shown:.*SCREEN_LABELS/);
  });

  it('⭐ ويُسجَّل **بعد** النجاح لا قبله', () => {
    // تسجيلٌ قبل التحديث يكتب تغييراً قد لا يقع.
    const body = bodyOf(service(), 'async apply(');
    expect(body.indexOf('company.update')).toBeLessThan(body.indexOf('this.audit.record'));
  });

  it('⭐② لا تطبيق بلا تأكيد صريح', () => {
    const body = bodyOf(service(), 'async apply(');
    expect(body).toMatch(/if \(!confirmed\) throw/);
    // والرفض **أول سطر**: فحصٌ بعد التحديث يمنع بعد وقوع الأثر.
    expect(body.indexOf('!confirmed')).toBeLessThan(body.indexOf('company.update'));
  });

  it('⭐ والتأكيد إلزاميٌّ في الـDTO — لا اختياريّ يُنسى', () => {
    const missing = validateSync(plainToInstance(SetPrimaryActivityDto, { activityId: 'a' }));
    expect(missing.map((e) => e.property)).toContain('confirmed');
    expect(validateSync(plainToInstance(SetPrimaryActivityDto, { activityId: 'a', confirmed: true }))).toEqual([]);
  });

  it('⭐ والمعاينة مسارٌ منفصل — نقطةٌ تعرض وتطبّق تُفقد التأكيد معناه', () => {
    const c = controller();
    expect(c).toMatch(/@Get\('primary\/preview'\)/);
    expect(c).toMatch(/@Patch\('primary'\)/);
    // والمعاينة **لا تكتب**: لا تحديث في جسمها.
    expect(bodyOf(service(), 'async preview(')).not.toContain('update');
  });

  it('⭐ والمعاينة تعرض الأسماء لا العدد وحده', () => {
    // «ستُخفى 4 شاشات» بلا أسمائها لا يُمكّن المالك من الحكم.
    const body = bodyOf(service(), 'async preview(');
    expect(body).toContain('willHide');
    expect(body).toContain('SCREEN_LABELS');
  });

  it('⭐③ التراجع فوريّ — `null` يُطفئ الترشيح', () => {
    const dto = plainToInstance(SetPrimaryActivityDto, { activityId: null, confirmed: true });
    expect(validateSync(dto)).toEqual([]);
    // والخدمة تقبله وتكتبه — لا ترفضه كقيمة ناقصة.
    expect(bodyOf(service(), 'async apply(')).toContain('primaryActivityId: nextActivityId');
  });

  it('⭐ ولا حذف بيانات في المسار كله', () => {
    // «الشاشات تختفي والبيانات تبقى» — والحارس على المسار لا على النيّة.
    const s = service();
    expect(/deleteMany|\.delete\(|DELETE\s+FROM/i.test(s)).toBe(false);
  });

  it('⭐ ونشاطٌ معطَّل لا يصلح رئيسياً', () => {
    // شاشاته لا تُحتسب أصلاً، فيصير الترشيح مشغَّلاً بلا مصدر — والنتيجة
    // النواة وحدها بلا سبب مفهوم.
    expect(bodyOf(service(), 'async apply(')).toContain('primary_activity_disabled');
  });

  it('⭐ ورسالتا الرفض عربيتان تدلّان على الفعل', () => {
    const msgs = readFileSync(join(__dirname, '..', 'common', 'i18n', 'messages.ts'), 'utf8');
    const needsConfirm = msgs.match(/primary_activity_needs_confirmation\]:\s*\{[\s\S]*?ar:\s*'([^']+)'/)?.[1] ?? '';
    expect(needsConfirm).toContain('ستختفي');
    const disabled = msgs.match(/primary_activity_disabled\]:\s*\{[\s\S]*?ar:\s*'([^']+)'/)?.[1] ?? '';
    expect(disabled).toContain('فعّله');
  });
});
