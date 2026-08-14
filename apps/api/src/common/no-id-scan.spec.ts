import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
   * عن أول ملف جديد يُكتب. `CLAUDE.md` وحده مستثنى — فهو **سجلّ القرار**، يقتبس
   * العبارة القديمة ليوثّق حذفها، ولا يدعو إليها.
   */
  it('لا موضع واحد في المستودع كلّه يسرد صورة الهوية بين أمثلة المرفقات', () => {
    const scanned: string[] = [];
    const offenders: string[] = [];
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
  });

  it('التعليق يحمل سبب الحذف — لا حذفاً صامتاً يُعاد نقضه', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const model = schema.indexOf('model ContractAttachment {');
    const doc = schema.slice(Math.max(0, model - 1400), model);
    expect(doc).toContain('2289');
    expect(doc).toContain('دون طلب أو أخذ نسخة منها');
  });

  it('واجهة الرفع تحمل التحذير بنصّه', () => {
    expect(readFileSync(uiPath, 'utf8')).toContain('لا ترفع صور الهويات — سجّل الرقم في حقله');
  });
});
