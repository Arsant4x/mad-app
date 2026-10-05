import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * القاعدةُ الدائمة ٤١ (`ق-١٦٤٣`): لا توقيعَ للوكيل في الالتزامات وطلبات الدمج — ببوّابتين.
 *
 * ① `.claude/settings.json` يحمل `attribution` بقيمتين فارغتين، فلا تضيف الأداةُ توقيعَها.
 * ② `.githooks/commit-msg` يحذف من رسالة الالتزام قبل الحفظ ثلاثةَ أسطر: ما يبدأ بـ`Co-Authored-By:`
 *    وما يبدأ بـ`Claude-Session:` وما فيه عبارةُ الأداة «Generated with Claude Code».
 *
 * والثاني يُثبَت **بالتشغيل لا بالقراءة** (§8.5: «مكتوبة» ليست «تعمل»): التزامٌ حقيقيّ في مستودعٍ
 * مؤقّت خطّافُه نسخةٌ من خطّاف المستودع، ثم تُقرأ الرسالةُ كما حُفظت. **وبحالتين** (القاعدة ٢٩):
 * أسطرٌ يجب أن تُحذف، وأسطرٌ تشبهها يجب أن تبقى — فحارسٌ يحذف كلَّ شيءٍ يسقط كما يسقط حارسٌ لا يحذف شيئاً.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const HOOK = join(REPO, '.githooks', 'commit-msg');

const DROP = [
  'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
  'co-authored-by: someone <someone@example.invalid>',
  'Claude-Session: 0f1e2d3c',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  'Generated with Claude Code',
];
const KEEP = [
  'docs(السجلّ): عنوانٌ عربيٌّ لا يُمسّ',
  'سطرٌ يذكر Claude Code في وسطه فيبقى',
  'وسطرٌ يذكر Co-Authored-By: في وسطه لا في أوّله فيبقى',
];

describe('لا توقيعَ للوكيل في الالتزام ولا في الطلب (القاعدة الدائمة ٤١)', () => {
  it('① الإعدادُ يُطفئ توقيعَ الأداة في الالتزام والطلب، وما فيه قبله باقٍ', () => {
    const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
    expect(settings.attribution).toEqual({ commit: '', pr: '' });
    expect(settings.hooks?.PreToolUse?.length).toBeGreaterThan(0);
  });

  it('② الخطّافُ يحذف أسطرَ التوقيع من التزامٍ حقيقيّ ويُبقي ما يشبهها', () => {
    expect(existsSync(HOOK)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
    try {
      const hooks = join(dir, '.probe-hooks');
      mkdirSync(hooks);
      copyFileSync(HOOK, join(hooks, 'commit-msg'));
      chmodSync(join(hooks, 'commit-msg'), 0o755);
      const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      git('init', '-q');
      git('config', 'user.name', 'probe');
      git('config', 'user.email', 'probe@example.invalid');
      git('config', 'core.hooksPath', hooks);
      writeFileSync(join(dir, 'a.txt'), 'x\n');
      git('add', 'a.txt');
      const message = [KEEP[0], '', KEEP[1], KEEP[2], '', ...DROP, ''].join('\n');
      writeFileSync(join(dir, '.probe-msg'), message);
      git('commit', '-q', '-F', '.probe-msg');
      const saved = git('log', '-1', '--format=%B');
      for (const line of KEEP) expect(saved).toContain(line);
      for (const line of DROP) expect(saved).not.toContain(line);
      expect(saved).not.toMatch(/generated with/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
