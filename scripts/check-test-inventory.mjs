import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { discoverTestFiles, testLaneNames } from './test-discovery.mjs';
import { findDisabledNodeTests } from './test-source-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const laneNames = new Set(testLaneNames);
const files = await discoverTestFiles([resolve(root, 'src'), resolve(root, 'tests')]);
const lanes = new Map();

for (const file of files) {
  const path = relative(root, file).split(sep).join('/');
  const lane = path.startsWith('src/') ? 'unit' : path.split('/')[1];
  assert.ok(lane !== undefined && laneNames.has(lane), `Unknown test lane for ${path}.`);
  const source = await readFile(file, 'utf8');
  const disabled = findDisabledNodeTests(path, source);
  assert.equal(disabled.length, 0, `${path} contains disabled Node tests: ${JSON.stringify(disabled)}`);
  assert.doesNotMatch(source, /\b(?:TODO|FIXME)\b/u, `${path} contains an unresolved test marker.`);
  lanes.set(lane, (lanes.get(lane) ?? 0) + 1);
}

assert.ok(files.length > 0, 'No executable test suites were found.');
process.stdout.write(`${JSON.stringify({
  suites: files.length,
  lanes: Object.fromEntries([...lanes].sort(([left], [right]) => left.localeCompare(right)))
})}\n`);
