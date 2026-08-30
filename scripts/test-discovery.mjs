import { resolve } from 'node:path';
import { globFiles } from './glob-files.mjs';

const testLaneNames = Object.freeze([
  'acceptance',
  'conformance',
  'invariants',
  'integration',
  'package',
  'performance',
  'runtime',
  'security-smoke',
  'unit'
]);

export async function discoverTestFiles(directories) {
  const files = new Set();
  for (const directory of directories) {
    for (const file of await discoverDirectory(resolve(directory))) files.add(file);
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}

export function testLaneDirectories(root, lane) {
  if (!testLaneNames.includes(lane)) throw new Error(`Unknown test lane: ${lane}`);
  return lane === 'unit'
    ? [resolve(root, 'src'), resolve(root, 'tests', 'unit')]
    : [resolve(root, 'tests', lane)];
}

async function discoverDirectory(directory) {
  const patterns = ['mjs', 'ts'].flatMap((extension) => [
    `**/*.test.${extension}`,
    `.*/**/*.test.${extension}`,
    `**/.*/**/*.test.${extension}`
  ]);
  return globFiles(directory, patterns);
}
