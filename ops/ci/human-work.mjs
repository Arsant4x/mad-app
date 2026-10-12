// "Human work" checks: what an added line of product code, a commit message
// or a pull request title must not carry. Pure functions; the CLI that feeds
// them a diff and the messages lives in human-work-check.mjs.

/** Product code files the line checks apply to. */
export const CODE_FILE = /^(apps|packages)\/.+\.(ts|tsx|js|jsx|mjs|cjs|css|scss|sql|prisma|html)$/;

/** Translation and message catalogues: user text lives there on purpose. */
export const TEXT_CATALOGUE = /^apps\/web\/src\/i18n\/locales\/[^/]+\.json$|^apps\/api\/src\/common\/i18n\/messages\.ts$/;

export const appliesTo = (path) => CODE_FILE.test(path) && !TEXT_CATALOGUE.test(path);

const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}/u;
const DECISION_REF = /ق-[0-9٠-٩]+/;
const WORKFLOW_WORD = /\bclaude\b|\bdirectives?\b|الوكيل|توجيه/i;
const ARABIC = /[؀-ۿ]/;

/** Removes the contents of quoted strings so a comment marker inside one is not read as a comment. */
function blankStrings(line) {
  return line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) => m[0] + ' '.repeat(m.length - 2) + m[0]);
}

/** The comment part of one source line, or '' when the line has none. */
export function commentPart(line, path) {
  const code = blankStrings(line);
  const trimmed = code.trimStart();
  if (/^(\*|\/\*|\{\s*\/\*)/.test(trimmed)) return line.slice(line.length - trimmed.length);
  const sqlLike = /\.(sql)$/.test(path);
  const marker = sqlLike ? code.indexOf('--') : code.search(/(^|[^:])\/\//);
  if (marker >= 0) return line.slice(sqlLike ? marker : marker + (code[marker] === '/' ? 0 : 1));
  const block = code.indexOf('/*');
  if (block >= 0) return line.slice(block);
  return '';
}

/** Problems on one added line of a product code file. */
export function lineProblems(line, path) {
  const out = [];
  if (EMOJI.test(line)) out.push('emoji');
  if (DECISION_REF.test(line)) out.push('decision reference');
  if (WORKFLOW_WORD.test(line)) out.push('work method word');
  if (ARABIC.test(commentPart(line, path))) out.push('Arabic in a comment');
  return out;
}

export const SUBJECT = /^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\([a-z0-9][a-z0-9./-]*\))?!?: \S.*$/;
export const SUBJECT_MAX = 72;

/** Problems in a commit message or a pull request title (the first line is the subject). */
export function messageProblems(text) {
  const message = String(text ?? '').replace(/\r\n/g, '\n').trim();
  const subject = message.split('\n')[0];
  const out = [];
  if (!SUBJECT.test(subject)) out.push('subject is not "type(scope): subject"');
  // The " (#123)" that a squash merge appends does not count toward the length.
  if (subject.replace(/ \(#\d+\)$/, '').length > SUBJECT_MAX) out.push(`subject longer than ${SUBJECT_MAX} characters`);
  if (ARABIC.test(message)) out.push('not English');
  if (EMOJI.test(message)) out.push('emoji');
  if (DECISION_REF.test(message)) out.push('decision reference');
  if (WORKFLOW_WORD.test(message)) out.push('work method word');
  return out;
}

/** Added lines per file from a unified diff with --unified=0. */
export function addedLines(diff) {
  const out = [];
  let path = null;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('+++ ')) {
      path = line === '+++ /dev/null' ? null : line.replace(/^\+\+\+ b\//, '');
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (path && line.startsWith('+') && !line.startsWith('+++')) {
      out.push({ path, line: lineNo, text: line.slice(1) });
      lineNo++;
    }
  }
  return out;
}
