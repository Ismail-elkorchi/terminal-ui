import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const includedExtensions = new Set(['.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.yaml', '.yml']);
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);
const failures = [];

for await (const filePath of filesUnder(root)) {
  if (!includedExtensions.has(path.extname(filePath))) continue;
  const content = await fs.readFile(filePath, 'utf8');
  const relative = path.relative(root, filePath);
  if (content.includes('\r')) failures.push(`${relative}: contains carriage returns`);
  if (/(?:^|\n)[^\n]*[ \t]+(?:\n|$)/u.test(content)) failures.push(`${relative}: contains trailing whitespace`);
  if (content.length > 0 && !content.endsWith('\n')) failures.push(`${relative}: missing final newline`);
}

if (failures.length > 0) throw new Error(`Source hygiene contract failed:\n${failures.join('\n')}`);

async function* filesUnder(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* filesUnder(entryPath);
    else if (entry.isFile()) yield entryPath;
  }
}
