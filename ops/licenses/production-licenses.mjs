#!/usr/bin/env node
// Lists every library used in production with its version and license, and writes
// docs/production-licenses.md.
//
//   node ops/licenses/production-licenses.mjs           write the file
//   node ops/licenses/production-licenses.mjs --check   exit 1 if the file is stale
//
// "Used in production" is the runtime dependencies of apps/api, apps/web and
// packages/shared followed through package-lock.json (required peers included,
// optional peers left out since a production install does not add them), plus the
// prisma CLI, which the server image runs for migrations. The web app's runtime
// dependencies are bundled into the page, so they count as shipped.
//
// The server image copies the whole node_modules from `npm ci`, so development tools
// sit in it unused. They are not listed one by one, but every package in the lockfile
// is checked and any license outside the permissive list is reported.
//
// The license comes from the lockfile, then the installed package.json, then the
// LICENSE or README text; anything still unknown is reported as unknown, never guessed.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'production-licenses.md');
const APPS = ['apps/api', 'apps/web', 'packages/shared'];
// Tools the production images run that are not runtime dependencies in package.json.
const EXTRA = [['apps/api', 'prisma', 'migration CLI run in the server image']];

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const entries = lock.packages;

/** Node resolution inside the lockfile: from `from`, look in each node_modules up to the root. */
function resolve(from, name) {
  let dir = from;
  for (;;) {
    const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    const hit = entries[candidate];
    if (hit) return hit.link ? hit.resolved : candidate;
    if (!dir) return null;
    const cut = dir.lastIndexOf('/node_modules/');
    dir = cut >= 0 ? dir.slice(0, cut) : '';
  }
}

/** Every lockfile path reachable from the production roots, with the apps that reach it. */
function productionClosure() {
  const seen = new Map();
  const missing = [];
  const roots = APPS.map((app) => [app, Object.keys({ ...entries[app]?.dependencies, ...entries[app]?.optionalDependencies })]);
  for (const [app, name] of EXTRA) roots.find(([a]) => a === app)[1].push(name);
  for (const [app, names] of roots) {
    const queue = names.map((name) => [app, name]);
    const visited = new Set();
    while (queue.length) {
      const [from, name] = queue.shift();
      const path = resolve(from, name);
      if (!path) {
        const parent = entries[from] ?? {};
        if (!parent.optionalDependencies?.[name]) missing.push(`${from} needs ${name}`);
        continue;
      }
      if (APPS.includes(path) || visited.has(path)) continue;
      visited.add(path);
      if (!seen.has(path)) seen.set(path, new Set());
      seen.get(path).add(app);
      const e = entries[path];
      const peers = Object.keys(e.peerDependencies ?? {}).filter((p) => !e.peerDependenciesMeta?.[p]?.optional);
      for (const dep of [...Object.keys({ ...e.dependencies, ...e.optionalDependencies }), ...peers]) queue.push([path, dep]);
    }
  }
  return { seen, missing };
}

const nameOf = (path) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

function licenseFromText(text) {
  if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose/i.test(text)) return 'ISC';
  if (/Apache License[\s\S]{0,40}Version 2\.0/i.test(text)) return 'Apache-2.0';
  return null;
}

function licenseOf(path) {
  const e = entries[path];
  if (typeof e.license === 'string' && e.license) return { license: e.license, source: 'lockfile' };
  const dir = join(ROOT, ...path.split('/'));
  const pj = join(dir, 'package.json');
  if (existsSync(pj)) {
    const p = JSON.parse(readFileSync(pj, 'utf8'));
    if (typeof p.license === 'string' && p.license) return { license: p.license, source: 'package.json' };
    if (p.license?.type) return { license: p.license.type, source: 'package.json' };
    if (Array.isArray(p.licenses) && p.licenses.length) {
      return { license: p.licenses.map((l) => l.type ?? l).join(' OR '), source: 'package.json' };
    }
  }
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    const licenseFile = files.find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    if (licenseFile) {
      const found = licenseFromText(readFileSync(join(dir, licenseFile), 'utf8').slice(0, 1500));
      if (found) return { license: found, source: `${licenseFile} text` };
    }
    const readme = files.find((f) => /^readme(\.|$)/i.test(f));
    if (readme) {
      const text = readFileSync(join(dir, readme), 'utf8');
      const at = text.search(/^#+\s*licen[cs]e/im);
      if (at >= 0) {
        const section = text.slice(at, at + 1500);
        const found = /\(The MIT License\)|^MIT\b/im.test(section.slice(0, 400)) ? 'MIT' : licenseFromText(section);
        if (found) return { license: found, source: `${readme} license section` };
      }
    }
  }
  return { license: 'UNKNOWN', source: existsSync(dir) ? 'not stated' : 'not installed' };
}

const PERMISSIVE = new Set([
  'MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0',
  'Python-2.0', 'BlueOak-1.0.0', 'Zlib', 'WTFPL', 'CC-BY-3.0', 'CC-BY-4.0', 'BSD', 'Artistic-2.0',
]);
const STRONG = /^(AGPL|GPL|SSPL|EUPL|OSL|CPAL|RPL|CC-BY-SA)/i;
const WEAK = /^(LGPL|MPL|EPL|CDDL|CPL)/i;

/**
 * Class of an SPDX-like expression. An OR with a permissive branch is permissive.
 * "other" is a named license outside the permissive list (for example one that limits use).
 */
export function classify(license) {
  if (/^UNKNOWN$|UNLICENSED|SEE LICENSE IN|custom/i.test(license)) return 'unknown';
  const branches = license.replace(/[()]/g, '').split(/\s+OR\s+/i).map((b) => b.trim());
  const kindOf = (b) => {
    const parts = b.split(/\s+AND\s+/i).map((p) => p.trim());
    if (parts.some((p) => STRONG.test(p))) return 'strong copyleft';
    if (parts.some((p) => WEAK.test(p))) return 'weak copyleft';
    return parts.every((p) => PERMISSIVE.has(p)) ? 'permissive' : 'other';
  };
  const kinds = branches.map(kindOf);
  for (const k of ['permissive', 'other', 'weak copyleft', 'strong copyleft']) if (kinds.includes(k)) return k;
  return 'unknown';
}

function build() {
  const { seen, missing } = productionClosure();
  const describe = (path) => {
    const { license, source } = licenseOf(path);
    return { name: nameOf(path), version: entries[path].version ?? '', license, source, kind: classify(license) };
  };
  const rows = [...seen.keys()]
    .map((path) => ({ ...describe(path), apps: [...seen.get(path)].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const others = Object.keys(entries)
    .filter((path) => path.includes('node_modules/') && !entries[path].link && !seen.has(path))
    .map(describe)
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const short = (apps) => apps.map((a) => posix.basename(a)).join(', ');
  const count = (list, k) => list.filter((r) => r.kind === k).length;
  const summary = (list) =>
    ['permissive', 'weak copyleft', 'strong copyleft', 'other', 'unknown'].map((k) => `${k}: ${count(list, k)}`).join(', ');
  const lines = [
    '# Production licenses',
    '',
    'Generated by `node ops/licenses/production-licenses.mjs` from `package-lock.json`. Do not edit by hand;',
    'run the script again after any dependency change (`--check` tells whether this file is stale).',
    '',
    'Used in production: the runtime dependencies of `apps/api`, `apps/web` and `packages/shared` followed through',
    'the lockfile (optional peers left out), plus the `prisma` CLI that the server image runs for migrations.',
    '"Used by" names the workspace whose runtime pulls the library in.',
    '',
    `Used in production: ${rows.length} libraries (${summary(rows)}).`,
    '',
    `The server image also carries the development tools, unused: ${others.length} more packages in the lockfile (${summary(others)}).`,
    '',
  ];
  const table = (list, withApps) => {
    const out = [withApps ? '| Library | Version | License | Class | Used by | License read from |' : '| Library | Version | License | Class | License read from |'];
    out.push(withApps ? '|---|---|---|---|---|---|' : '|---|---|---|---|---|');
    for (const r of list) {
      out.push(withApps ? `| ${r.name} | ${r.version} | ${r.license} | ${r.kind} | ${short(r.apps)} | ${r.source} |` : `| ${r.name} | ${r.version} | ${r.license} | ${r.kind} | ${r.source} |`);
    }
    return out;
  };
  const flagged = rows.filter((r) => r.kind !== 'permissive');
  lines.push('## Needs review: used in production', '');
  if (flagged.length) lines.push(...table(flagged, true), '');
  else lines.push('None.', '');
  const flaggedOthers = others.filter((r) => r.kind !== 'permissive');
  lines.push('## Needs review: in the lockfile but not used in production', '');
  if (flaggedOthers.length) lines.push(...table(flaggedOthers, false), '');
  else lines.push('None.', '');
  if (missing.length) lines.push('## Dependencies not found in the lockfile', '', ...missing.map((m) => `* ${m}`), '');
  lines.push('## All libraries used in production', '', '| Library | Version | License | Used by |', '|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.name} | ${r.version} | ${r.license} | ${short(r.apps)} |`);
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = build();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== text) {
      console.error('docs/production-licenses.md is stale: run node ops/licenses/production-licenses.mjs');
      process.exit(1);
    }
    console.log('docs/production-licenses.md is current');
  } else {
    writeFileSync(OUT, text);
    for (const l of text.split('\n').filter((x) => /^(Used in production:|The server image)/.test(x))) console.log(l);
  }
}
