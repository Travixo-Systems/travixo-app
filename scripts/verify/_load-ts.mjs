// Compile a project .ts module to ESM on the fly and import it, so gates
// exercise the SHIPPING source rather than a hand-copied duplicate.
// Uses the TypeScript compiler already present as a transitive dep - no new
// npm dependency is introduced.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export async function loadTs(relPath) {
  const ts = require('typescript');
  const src = readFileSync(relPath, 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: relPath,
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), 'unlazy-ts-'));
  const file = join(dir, 'mod.mjs');
  writeFileSync(file, out, 'utf8');
  return import(pathToFileURL(file).href);
}
