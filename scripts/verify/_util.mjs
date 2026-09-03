// Shared helpers for unlazy gate verification scripts.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export function read(p) { return readFileSync(p, 'utf8'); }

export function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; return false; }
  console.log(`  ok: ${msg}`);
  return true;
}

export function gitShow(rev, path) {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch { return null; }
}

export function done(token) {
  if (process.exitCode) { console.error(`\n${token} NOT emitted - gate unmet.`); process.exit(1); }
  console.log(`\n${token}`);
}
