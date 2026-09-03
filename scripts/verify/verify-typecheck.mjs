import { execFileSync } from 'node:child_process';
try {
  execFileSync('npx', ['tsc', '--noEmit'], { encoding: 'utf8', stdio: 'pipe', shell: true, timeout: 600000 });
  console.log('tsc --noEmit exited 0');
  console.log('\nTYPECHECK_CLEAN');
} catch (e) {
  console.error((e.stdout || '') + (e.stderr || ''));
  console.error('\nTYPECHECK_CLEAN not emitted - tsc reported errors.');
  process.exit(1);
}
