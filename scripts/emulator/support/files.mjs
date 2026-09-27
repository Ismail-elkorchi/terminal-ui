import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export async function findExecutable(name, required = true) {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (directory === '') continue;
    const candidate = path.join(directory, name);
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Search the next PATH entry.
    }
  }
  if (required) throw new Error(`Required executable is not on PATH: ${name}`);
  return undefined;
}

export async function assertExecutable(filePath) {
  await fs.access(filePath, fs.constants.X_OK);
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function clearArtifacts(directory, names) {
  await Promise.all((names ?? await fs.readdir(directory)).map((name) =>
    fs.rm(path.join(directory, name), { recursive: true, force: true })));
}

export function requiredEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') throw new Error(`${name} must name a pinned executable.`);
  return value;
}
