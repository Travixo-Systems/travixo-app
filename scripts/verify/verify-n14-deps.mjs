import { readFileSync } from 'node:fs';
import { assert, done, gitShow } from './_util.mjs';
const BASE = readFileSync('.unlazy-baseline', 'utf8').trim();
const now = JSON.parse(readFileSync('package.json', 'utf8'));
const base = JSON.parse(gitShow(BASE, 'package.json'));
assert(JSON.stringify(now.dependencies) === JSON.stringify(base.dependencies), 'no new runtime dependencies');
assert(JSON.stringify(now.devDependencies) === JSON.stringify(base.devDependencies), 'no new dev dependencies');
done('DEPS_UNCHANGED');
