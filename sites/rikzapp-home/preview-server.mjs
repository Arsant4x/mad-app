// خادمُ معاينةٍ محلّيّ لصفحة التعريف وحدَها، لا يُرفع ولا يُنشر (ق-١٦٥٣).
// يخدم `public/` ويطبّق قواعدَ `public/_headers` كما يطبّقها Cloudflare Pages،
// فتُختبر سياسةُ أمان المحتوى ومنعُ الفهرسة محلّياً قبل الرفع.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 8788);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** قواعدُ `_headers`: سطرُ مسارٍ ثم أسطرُ «اسم: قيمة» مزاحة. */
async function loadRules() {
  const text = await readFile(join(ROOT, '_headers'), 'utf8');
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ path: line.trim(), headers: [] }); continue; }
    const at = line.indexOf(':');
    rules.at(-1)?.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
  }
  return rules;
}

function matches(pattern, path) {
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep) || path.endsWith('/_headers')) { res.writeHead(404).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' };
    for (const rule of await loadRules()) if (matches(rule.path, url.pathname)) for (const [k, v] of rule.headers) headers[k] = v;
    res.writeHead(200, headers).end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PORT, () => console.log(`rikzapp-home preview on http://localhost:${PORT}`));
