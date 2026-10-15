// Repository root, resolved from this folder (ops/process-gates).
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The command runs exactly that hook file and the file exists. A substring check is not
 * enough: a renamed command such as "<file>.off" still contains the name and runs nothing.
 */
export function runsHook(command, file) {
  const m = command.match(/(?:^|\s)node\s+("?)([^\s"]+)\1(?:\s|$)/);
  if (!m) return false;
  const path = m[2].replace(/\\/g, '/');
  return path.endsWith(`.claude/hooks/${file}`) && existsSync(resolve(REPO, path));
}
