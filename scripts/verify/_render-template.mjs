// Render any project email template to HTML, exactly as email-service does, so
// gates can assert on what a recipient actually receives.
//
// Uses the project's own TypeScript + React Email packages. No new dependency.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// Emitted INSIDE the project: eslint aside, Node resolves bare imports
// ('react', '@react-email/*') against the nearest node_modules, and a tmpdir
// copy has none.
const OUT_DIR = '.unlazy-render';

function transpileTree(entryRel, seen) {
  const ts = require('typescript');
  if (seen.has(entryRel)) return seen.get(entryRel);

  const src = readFileSync(entryRel, 'utf8');
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: entryRel,
  }).outputText;

  const outPath = join(OUT_DIR, entryRel.replace(/\.tsx?$/, '.mjs'));
  seen.set(entryRel, outPath);
  mkdirSync(dirname(outPath), { recursive: true });

  // Follow relative imports so shared components (header, footer, tables)
  // resolve. Type-only imports of project paths are dropped by the compiler.
  const rewritten = compiled.replace(/from\s+["'](\.[^"']+)["']/g, (whole, spec) => {
    const base = join(dirname(entryRel), spec).replace(/\\/g, '/');
    for (const ext of ['.tsx', '.ts']) {
      try {
        readFileSync(base + ext, 'utf8');
        transpileTree(base + ext, seen);
        return `from "${spec}.mjs"`;
      } catch { /* try next extension */ }
    }
    return whole;
  });

  writeFileSync(outPath, rewritten, 'utf8');
  return outPath;
}

/**
 * @param {string} fileRel  repo-relative path to the .tsx template
 * @param {string} exportName  the component export to call
 * @param {object} props  props passed to the component
 * @returns {Promise<string>} rendered HTML
 */
export async function renderTemplate(fileRel, exportName, props) {
  const seen = new Map();
  const entry = transpileTree(fileRel, seen);
  // Cache-bust so repeated renders in one process pick up edits.
  const mod = await import(`${pathToFileURL(entry).href}?t=${seen.size}`);
  const component = mod[exportName] || mod.default;
  if (typeof component !== 'function') {
    throw new Error(`${fileRel} has no callable export "${exportName}"`);
  }
  const { render } = await import('@react-email/render');
  return render(component(props));
}

export function cleanupRenderDir() {
  rmSync(OUT_DIR, { recursive: true, force: true });
}
