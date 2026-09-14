// I6: no new npm dependencies. The route rewrite imports @sentry/node, which
// must already have been present -- adding a dependency to land a hotfix is a
// separate decision with its own review.
import { readFileSync } from 'node:fs';
import { assert, done, gitShow } from './_util.mjs';

const BASE = readFileSync('.unlazy-baseline', 'utf8').trim();
const now = JSON.parse(readFileSync('package.json', 'utf8'));
const base = JSON.parse(gitShow(BASE, 'package.json'));

assert(JSON.stringify(now.dependencies) === JSON.stringify(base.dependencies),
  'no new runtime dependencies');
assert(JSON.stringify(now.devDependencies) === JSON.stringify(base.devDependencies),
  'no new dev dependencies');
assert(Object.prototype.hasOwnProperty.call(base.dependencies, '@sentry/node'),
  '@sentry/node was already a dependency at baseline (the route rewrite imports it)');

done('I6_DEPS_UNCHANGED');
