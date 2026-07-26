import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

export const testLaneNames = Object.freeze([
  'acceptance',
  'conformance',
  'integration',
  'package',
  'performance',
  'property',
  'runtime',
  'security',
  'unit'
]);

export async function discoverTestFiles(directories) {
  const files = [];
  for (const directory of directories) {
    files.push(...await discoverDirectory(resolve(directory)));
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function testLaneDirectories(root, lane) {
  if (!testLaneNames.includes(lane)) throw new Error(`Unknown test lane: ${lane}`);
  return lane === 'unit'
    ? [resolve(root, 'src'), resolve(root, 'tests', 'unit')]
    : [resolve(root, 'tests', lane)];
}

async function discoverDirectory(directory) {
  const files = [];
  const patterns = ['mjs', 'ts'].flatMap((extension) => [
    `**/*.test.${extension}`,
    `.*/**/*.test.${extension}`,
    `**/.*/**/*.test.${extension}`
  ]);
  for await (const file of glob(patterns, { cwd: directory })) {
    files.push(resolve(directory, file));
  }
  return files.sort((left, right) => left.localeCompare(right));
}
