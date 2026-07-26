import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function globFiles(directory, patterns, options = {}) {
  const cwd = resolve(directory);
  const files = new Set();
  for await (const entry of glob(patterns, {
    cwd,
    withFileTypes: true,
    ...(options.exclude === undefined ? {} : { exclude: options.exclude })
  })) {
    if (entry.isFile()) files.add(resolve(entry.parentPath, entry.name));
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}
