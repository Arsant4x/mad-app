import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from './source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): هذا حارسُ **سياسة**، ومناطُه أن
// **يُذكر** رفعُ صورة الهوية — **في تعليقٍ أو نصٍّ أو وثيقة**، لا في شيفرةٍ
// تنفيذية وحدها. **فتجريدُ التعليقات والنصوص يُلغي غرضَه**؛ ولذلك يستثني
// السطرَ صراحةً بعلاماتِ نفيٍ مكتوبة (`⚠️` · `لا ترفع` · `not`).
readsDeclaredStrings();

/**
 * لائحة مرفق الضيافة السياحي (القرار الوزاري 2289) — المادة الثامنة والعشرون/14:
 *
 *   «…على أن يتم التحقق منها من خلال الاطلاع على أصلها عند تسجيل الدخول،
 *    وتسجيل بياناتها فقط، **دون طلب او أخذ نسخه منها**…»
 *
 * الإلزام يقع على **المرفق المرخَّص** (عميلنا) لا على مزوّد النظام. لكن تعليق
 * `ContractAttachment` كان يسرد «an ID scan» بين أمثلة الاستعمال المتوقَّعة —
 * أي أن وثيقتنا كانت تدفع العميل إلى المخالفة بالاسم. حُذفت في 2026-08-14.
 *
 * وهذا الحارس يمنع عودتها. وهو نصّي عمداً: لا يمكن منع رفع صورة هوية تقنياً
 * (الصور مسموحة لأسباب مشروعة — صور التسليم ومرفقات المطالبات)، فالمتاح هو
 * ألّا **ندعو** إليها. والدعوة نصّ، فحارسها نصّي.
 *
 * ⚠️ وحدّه معلَن: يحرس ما نكتبه نحن، لا ما يرفعه المستخدم. البند الذي يعالج
 * السبب هو حقل رقم الهوية المُهمَّأ — فمن لا يجد مكاناً للرقم يرفع الصورة.
 */
describe('لا دعوة إلى صور الهويات (لائحة 2289 م.٢٨/١٤)', () => {
  const repoRoot = join(__dirname, '..', '..', '..', '..');
  const schemaPath = join(repoRoot, 'apps', 'api', 'prisma', 'schema.prisma');
  const uiPath = join(
    repoRoot, 'apps', 'web', 'src', 'pages', 'contracts', 'AttachmentsSection.tsx',
  );

  /** الأمثلة وحدها — لا التحذير الذي يشرح لماذا حُذفت العبارة. */
  const attachmentDoc = (): string => {
    const schema = readFileSync(schemaPath, 'utf8');
    const model = schema.indexOf('model ContractAttachment {');
    expect(model).toBeGreaterThan(-1);

    // تعليق `///` المتّصل الذي يسبق النموذج مباشرةً — يُقرأ صعوداً من النموذج
    // لا هبوطاً من بداية الملف. (سطرٌ ثابت أو `lastIndexOf` على فاصلٍ فارغ
    // كسرهما CRLF من قبل، ونطاقٌ أوسع التقط تعليق نموذجٍ مجاور.)
    const lines = schema.slice(0, model).split(/\r?\n/);
    const doc: string[] = [];
    for (let i = lines.length - 2; i >= 0 && lines[i].trimStart().startsWith('///'); i--) {
      doc.unshift(lines[i]);
    }
    expect(doc.length).toBeGreaterThan(0);

    // يُستبعد ما بعد علامة التحذير: هي تشرح الحظر، فلا تُحسب مخالفةً له.
    const warn = doc.findIndex((l) => l.includes('⚠️'));
    return (warn === -1 ? doc : doc.slice(0, warn)).join('\n');
  };

  it('تعليق ContractAttachment لا يسرد صورة الهوية بين أمثلته', () => {
    const examples = attachmentDoc();
    for (const banned of ['ID scan', 'id scan', 'ID copy', 'identity scan', 'صورة الهوية']) {
      expect(examples).not.toContain(banned);
    }
  });

  /**
   * الصيغة الأولى من هذا الحارس قرأت المخطط وحده — والعبارة كانت في **ستة**
   * مواضع. لم يكشفها الحارس بل عرضٌ عارض للملف أثناء الإثبات العكسي. فالحارس
   * الذي يقرأ موضعاً واحداً من ستة **يُصدّق حذفاً لم يقع**.
   *
   * ولذلك يمسح هذا الفحص المستودع كلّه بدل سرد مسارات: قائمةٌ مكتوبة بيد تتخلّف
   * عن أول ملف جديد يُكتب. `CLAUDE.md` مستثنى — فهو **سجلّ القرار**، يقتبس
   * العبارة القديمة ليوثّق حذفها، ولا يدعو إليها.
   *
   * ## ⚠️ والاستثناء بالاسم تخلّف فعلاً — 2026-08-29
   *
   * نُقلت ٥٥٤ سطراً من `CLAUDE.md §9` إلى `docs/سجل-الخارطة-والقرارات.md`،
   * وفيها سجلّ حادثة صورة الهوية **يقتبس العبارة ليوثّق حذفها**. فسقط الحارس
   * على `main` — **والنصّ نفسه كان مستثنى قبل النقل بسطر واحد**.
   *
   * وهو تحقّقٌ حرفيّ لما حذّر منه تعليق الحارس: **قائمةٌ مكتوبة بيد تتخلّف عن
   * أول ملف جديد**. وإضافة اسمٍ ثانٍ إليها تكرارٌ للعلّة لا علاج.
   *
   * فصار الاستثناء **مُعلَناً في الملف نفسه** بعلامةٍ تحمل سببها:
   *
   *     <!-- no-id-scan: سجلّ قرار — يقتبس العبارة ليوثّق حذفها -->
   *
   * ⚠️ **والعلامة تُقرأ من الملف لا من قائمةٍ هنا**: فملفُّ سجلٍّ جديد يُعلن
   * نفسه، ولا يعود الحارس يتخلّف. **وسببٌ فارغ لا يُقبل** — وإلا صارت
   * العلامة مفتاح إسكات.
   */
  it('لا موضع واحد في المستودع كلّه يسرد صورة الهوية بين أمثلة المرفقات', () => {
    const scanned: string[] = [];
    const offenders: string[] = [];
    /** الملفات التي أعلنت نفسها سجلّ قرار — بسببها، كي تُقرأ لا لتُنسى. */
    const declared: string[] = [];
    const BANNED = /ID scans?\b|identity scans?\b|ID cop(y|ies)\b|صور?ة? الهوية/i;
    const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', 'playwright-report']);
    const EXT = /\.(ts|tsx|prisma|sql|md)$/;

    const walk = (dir: string): void => {
      for (const e of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!EXT.test(e.name)) continue;
        // سجلّ القرار وهذا الحارس نفسه — كلاهما يذكر العبارة ليمنعها.
        if (e.name === 'CLAUDE.md' || e.name === 'no-id-scan.spec.ts') continue;
        const body = readFileSync(p, 'utf8');
        // علامةٌ يُعلنها الملف عن نفسه، بسببٍ مكتوب — لا اسمٌ في قائمةٍ هنا.
        const marker = /<!--\s*no-id-scan:\s*(.+?)\s*-->/.exec(body.slice(0, 2000));
        if (marker) {
          declared.push(`${p.slice(repoRoot.length + 1)} ⟵ ${marker[1]}`);
          continue;
        }
        scanned.push(p);
        readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => {
          // يُستثنى النفي الصريح: «Deliberately not "an ID scan"» و«Not ID scans».
          if (BANNED.test(line) && !/\bnot\b|⚠️|لا ترفع|يُمنع/i.test(line)) {
            offenders.push(`${p.slice(repoRoot.length + 1)}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    };
    walk(repoRoot);

    // عكسُ الحارس: مسحٌ فارغ ينجح كذباً. لا بدّ أن يكون قد قرأ شيئاً فعلاً.
    expect(scanned.length).toBeGreaterThan(300);
    expect(offenders).toEqual([]);

    /**
     * ⚠️ **والعلامة لا تُقبل بلا سبب** — وإلا صارت مفتاح إسكات: من ضاق
     * بالحارس كتب `<!-- no-id-scan: -->` ومضى. فيُفحص أن لكل معلِنٍ سبباً
     * مكتوباً، ويُطبع الإعلان في الحصيلة كي يُقرأ لا كي يُنسى.
     */
    for (const line of declared) {
      const reason = line.split('⟵')[1]?.trim() ?? '';
      expect({ line, hasReason: reason.length > 15 }).toEqual({ line, hasReason: true });
    }
  });

  it('التعليق يحمل سبب الحذف — لا حذفاً صامتاً يُعاد نقضه', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const model = schema.indexOf('model ContractAttachment {');
    const doc = schema.slice(Math.max(0, model - 1400), model);
    expect(doc).toContain('2289');
    expect(doc).toContain('دون طلب أو أخذ نسخة منها');
  });

  // The UI text lives behind a translation key; the Arabic wording is checked in the Arabic translation file.
  const arContracts = (): { attachments: Record<string, string>; claims: Record<string, string> } =>
    JSON.parse(readFileSync(join(repoRoot, 'apps', 'web', 'src', 'i18n', 'locales', 'ar', 'contracts.json'), 'utf8'));

  it('واجهة الرفع تحمل التحذير بنصّه', () => {
    expect(readFileSync(uiPath, 'utf8')).toContain("t('contracts.attachments.id_warning')");
    expect(arContracts().attachments.id_warning).toContain('لا ترفع صور الهويات — سجّل الرقم في حقله');
  });

  /**
   * ⚖️ `ق-١٣٦٥` — **وحدُّ المطالبة يُعلَن في شاشة رفعها** بنصّ المالك: «لا تُرفع صورُ الهويّات هنا». فمرفقاتُ المطالبة في المخزن
   * العاديّ (لا غلاف)، **ولا مخزنَ لهويّات النزلاء والمستأجرين** — فالتحذيرُ حيث يقع الرفع لا في وثيقةٍ بعيدة.
   */
  it('شاشةُ رفع مرفقات المطالبة تحمل حدَّها بنصّ المالك', () => {
    const claims = join(repoRoot, 'apps', 'web', 'src', 'pages', 'contracts', 'ClaimsSection.tsx');
    expect(readFileSync(claims, 'utf8')).toContain("t('contracts.claims.id_warning')");
    expect(arContracts().claims.id_warning).toContain('لا تُرفع صورُ الهويّات هنا');
  });
});
