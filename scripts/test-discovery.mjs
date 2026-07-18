import { readdir } from 'node:fs/promises';
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

const testFilePattern = /\.test\.(?:mjs|ts)$/u;

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
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await discoverDirectory(path));
    } else if (entry.isFile() && testFilePattern.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}
