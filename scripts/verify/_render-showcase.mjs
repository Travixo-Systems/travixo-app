// Render the real showcase template to HTML, exactly as email-service.ts does,
// so gates can assert on what the recipient actually receives.
//
// Uses the project's own TypeScript + React Email packages. No new dependency.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** Transpile one project .tsx/.ts file, rewriting relative deps recursively. */
function transpileTree(entryRel, outDir, seen = new Map()) {
  const ts = require('typescript');
  if (seen.has(entryRel)) return seen.get(entryRel);

  const src = readFileSync(entryRel, 'utf8');
  const outText = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: entryRel,
  }).outputText;

  const outRel = entryRel.replace(/\.tsx?$/, '.mjs');
  const outPath = join(outDir, outRel);
  seen.set(entryRel, outPath);
  mkdirSync(dirname(outPath), { recursive: true });

  // Follow relative imports so the component tree (header/footer) resolves.
  const rewritten = outText.replace(
    /from\s+["'](\.[^"']+)["']/g,
    (whole, spec) => {
      const base = join(dirname(entryRel), spec).replace(/\\/g, '/');
      for (const ext of ['.tsx', '.ts']) {
        try {
          readFileSync(base + ext, 'utf8');
          transpileTree(base + ext, outDir, seen);
          return `from "${spec}.mjs"`;
        } catch { /* try next extension */ }
      }
      return whole;
    }
  );

  writeFileSync(outPath, rewritten, 'utf8');
  return outPath;
}

export async function renderShowcase() {
  // Emit inside the project so bare imports ('react', '@react-email/*')
  // resolve against the project's own node_modules. A temp dir cannot.
  const outDir = '.unlazy-render';
  rmSync(outDir, { recursive: true, force: true });
  const entry = transpileTree('lib/email/templates/demo-showcase-alert.tsx', outDir);
  const mod = await import(pathToFileURL(entry).href);
  const { render } = await import('@react-email/render');

  return render(
    mod.DemoShowcaseAlert({
      organizationName: 'EuroRent Equip',
      specimen: {
        assetName: 'Chariot elevateur Toyota 8FD25',
        serialNumber: 'CHA-2021-0103',
        daysOverdue: 10,
        actionRequired: 'Planifier la VGP.',
      },
      appUrl: 'https://app.travixosystems.com',
    })
  );
}
