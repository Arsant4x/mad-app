import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): المقروءُ **أسماءُ شاشاتٍ وقطاعاتٍ
// معلَنةٌ نصّاً** — **لا نمطٌ برمجيّ**، فتجريدُ النصوص يُفرغ ما يقارنه.
readsDeclaredStrings();
import { ALLOWED_SCREENS } from '../templates/screens';
import {
  catalogSectorsFor,
  CORE_SCREENS,
  RAW_GATED_SCREENS,
  RAW_SECTOR_EXTRAS,
  SECTORS,
  SECTOR_LABELS,
  Sector,
  screensFor,
  suggestSector,
} from './sectors';

describe('الخريطة مشتقّة من `ALLOWED_SCREENS` — لا مكتوبة يدوياً', () => {
  it('يقرأ شيئاً فعلاً — حارسٌ على خريطةٍ فارغة ليس حارساً', () => {
    expect(SECTORS.length).toBeGreaterThan(5);
    expect(ALLOWED_SCREENS.length).toBe(25);
    expect(Object.keys(RAW_SECTOR_EXTRAS)).toHaveLength(SECTORS.length);
  });

  it('⭐ كل اسمٍ في الخريطة **الخام** موجودٌ في `ALLOWED_SCREENS`', () => {
    // ⚠️ على الخام لا على مخرَج `screensFor`: الأخير يُرشِّح، والترشيح
    // **يخفي الخطأ** — اسمٌ مخترَع يُحذف صامتاً فتُنتَج خريطةٌ ناقصة تبدو
    // سليمة. وهي الحادثة التي وقعت حرفياً في `RAW_DOMAINS`.
    const invented: string[] = [];
    for (const [sector, extras] of Object.entries(RAW_SECTOR_EXTRAS)) {
      for (const s of extras) if (!(ALLOWED_SCREENS as readonly string[]).includes(s)) invented.push(`${sector}: ${s}`);
    }
    for (const s of RAW_GATED_SCREENS) if (!(ALLOWED_SCREENS as readonly string[]).includes(s)) invented.push(`GATED: ${s}`);
    expect(invented).toEqual([]);
  });

  it('⭐ النواة + المُرشَّحة = الخمس والعشرون بالضبط، بلا تداخل', () => {
    // النواة تُعرَّف **بالطرح**: شاشةٌ جديدة تصير نواةً تلقائياً فتظهر
    // للجميع. والعدُّ اليدوي يجعلها **تختفي عن الجميع** بصمت.
    // (والثامنةَ عشرةَ «النماذج» منذ توجيه ٢٨١، `ق-١٦٤١`/٢: نواةٌ لا يحجبها نشاط.)
    expect(CORE_SCREENS).toHaveLength(18);
    expect(RAW_GATED_SCREENS).toHaveLength(7);
    expect([...CORE_SCREENS, ...RAW_GATED_SCREENS].sort()).toEqual([...ALLOWED_SCREENS].sort());
    expect(CORE_SCREENS.filter((s) => (RAW_GATED_SCREENS as readonly string[]).includes(s))).toEqual([]);
  });

  it('⭐ اتحاد القطاعات يغطّي الأربع والعشرين — لا شاشة ميتة', () => {
    // شاشةٌ لا يراها أي قطاع هي شاشةٌ مبنيّة لا تُفتح أبداً — وتبقى في
    // الشريط والمسارات والاختبارات بلا مستخدم.
    const union = new Set<string>();
    for (const s of SECTORS) for (const screen of screensFor([s])) union.add(screen);
    expect([...union].sort()).toEqual([...ALLOWED_SCREENS].sort());
  });

  it('⭐ النواة داخل كل قطاع بلا استثناء', () => {
    for (const s of SECTORS) {
      const seen = screensFor([s]);
      const missing = CORE_SCREENS.filter((c) => !seen.has(c));
      expect({ sector: s, missing }).toEqual({ sector: s, missing: [] });
    }
  });

  it('⭐ لا أنشطة ⇒ **الكل** — فلا يستيقظ تاجر بلا شاشاته', () => {
    expect([...screensFor([])].sort()).toEqual([...ALLOWED_SCREENS].sort());
  });

  it('⭐ `OTHER` ترى الكل — المهرب الآمن', () => {
    expect([...screensFor(['OTHER'])].sort()).toEqual([...ALLOWED_SCREENS].sort());
  });

  it('لكل قطاع تسمية عربية — ولا قطاع بلا اسم', () => {
    for (const s of SECTORS) expect({ s, label: (SECTOR_LABELS[s] ?? '').length > 0 }).toEqual({ s, label: true });
  });
});

describe('الخريطة المعتمَدة — بتعديلات المالك الثلاثة', () => {
  const of = (s: Sector) => [...screensFor([s])].sort();

  it('المكتب العقاري: عقارات وعقود وصيانة، بلا نقطة بيع', () => {
    const seen = of('REALESTATE');
    for (const s of ['properties', 'contracts', 'maintenance']) expect(seen).toContain(s);
    for (const s of ['pos', 'products', 'inventory']) expect(seen).not.toContain(s);
  });

  it('⭐ العمل الحرّ: `products` نعم و`inventory` لا (تعديل المالك أ)', () => {
    // منتجاتٌ رقمية وقوالب تُعرَّف وتُفوتر، بلا مخزون مادي يُتابَع.
    const seen = of('FREELANCE');
    expect(seen).toContain('products');
    expect(seen).toContain('quotes');
    expect(seen).not.toContain('inventory');
    expect(seen).not.toContain('pos');
  });

  it('⭐ المقاولات: `inventory` باقٍ (تعديل المالك ب)', () => {
    const seen = of('CONTRACTING');
    expect(seen).toContain('inventory');
    expect(seen).toContain('quotes');
    expect(seen).not.toContain('properties');
  });

  it('⭐ الصيدلية = المطعم حرفياً (حدٌّ معلَن، تعديل المالك ج)', () => {
    // يسقط هذا الاختبار يوم يُفرَّق بينهما — **وهو المقصود**: الفرق قرارٌ
    // يُتخذ لا يقع صدفةً.
    expect(of('PHARMACY')).toEqual(of('RESTAURANT'));
  });

  it('التجزئة تزيد `quotes` على المطعم', () => {
    expect(of('RETAIL')).toContain('quotes');
    expect(of('RESTAURANT')).not.toContain('quotes');
  });

  it('⭐ قطاعان معاً ⇒ اتحادٌ لا تقاطع', () => {
    // منشأةٌ بنشاطين ترى شاشات الاثنين. والتقاطع يُخفي عنها ما تعمل عليه.
    const both = [...screensFor(['REALESTATE', 'RETAIL'])];
    for (const s of ['properties', 'contracts', 'pos', 'products']) expect(both).toContain(s);
  });
});

describe('⚖️ كتالوجُ القوالب العامّة بأنشطة المنشأة بقاعدة الشاشات (ق-١٦٤١/٣)', () => {
  it('⭐ قطاعاتُ الأنشطة تُرشّح، والمكرَّرُ واحد', () => {
    expect(catalogSectorsFor(['REALESTATE'])).toEqual(['REALESTATE']);
    expect(catalogSectorsFor(['REALESTATE', 'RETAIL', 'REALESTATE'])).toEqual(['REALESTATE', 'RETAIL']);
  });

  it('⭐ لا أنشطة ⇒ لا ترشيح، و«أخرى» تفتح الكلّ — كالشاشات', () => {
    expect(catalogSectorsFor([])).toBeNull();
    expect(catalogSectorsFor(['RESTAURANT', 'OTHER'])).toBeNull();
  });
});

describe('المطابقة اقتراحٌ لا حكم', () => {
  it('تطابق النصوص المعروفة', () => {
    expect(suggestSector('عقارات')).toBe('REALESTATE');
    expect(suggestSector('مطعم شعبي')).toBe('RESTAURANT');
    expect(suggestSector('صيدلية النهدي')).toBe('PHARMACY');
    expect(suggestSector('مقاولات عامة')).toBe('CONTRACTING');
    expect(suggestSector('Retail')).toBe('RETAIL');
  });

  it('⭐ الأخصّ يفوز: «متجر أدوية» صيدلية لا تجزئة', () => {
    // كلمات التجزئة عامّة («متجر» · «بيع») فتبتلع ما قبلها لو سبقتها.
    expect(suggestSector('متجر أدوية')).toBe('PHARMACY');
    expect(suggestSector('متجر عقارات')).toBe('REALESTATE');
  });

  it('⭐ ما لا يُطابق يعود `null` — لا `OTHER` بثقةٍ كاذبة', () => {
    // «أخرى» ليست شيئاً يُطابَق بل ما يبقى حين لا يُطابق شيء. وإرجاعها
    // هنا يجعل كل نصٍّ غامض «مؤكَّداً» بدل أن يُترك للمالك.
    for (const t of ['مؤسسة الرياض', 'شركة', '', '   ', null, undefined]) {
      expect({ t, got: suggestSector(t) }).toEqual({ t, got: null });
    }
  });

  it('⭐ ولا تُرجِع `OTHER` أبداً مهما كان النصّ', () => {
    const samples = ['أخرى', 'other', 'متنوع', 'عقارات', 'مطعم', 'xyz'];
    expect(samples.map(suggestSector).filter((s) => s === 'OTHER')).toEqual([]);
  });

  it('⭐ ولا تكتب `sector` — الملف لا يعرف الحقل أصلاً', () => {
    // قرار المالك: الاقتراح يُكتب في `sectorSuggested` وحده. وحارسٌ نصّي
    // لأن الخطأ هنا صامت: يُطابَق نصٌّ غامض فتختفي شاشةٌ يعمل عليها تاجر.
    const src = readFileSync(join(__dirname, 'sectors.ts'), 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(/sector\s*[:=]\s*suggest/i.test(src)).toBe(false);
    expect(src).not.toContain('sectorSuggested');
  });
});
