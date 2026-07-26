import fs from 'node:fs/promises';
import path from 'node:path';
import { globFiles } from './glob-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const includedExtensions = ['.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.yaml', '.yml'];
const ignoredDirectories = [
  '.git/**',
  '**/.git/**',
  'dist/**',
  '**/dist/**',
  'node_modules/**',
  '**/node_modules/**'
];
const failures = [];

for (const filePath of await filesUnder(root)) {
  const content = await fs.readFile(filePath, 'utf8');
  const relative = path.relative(root, filePath);
  if (content.includes('\r')) failures.push(`${relative}: contains carriage returns`);
  if (/(?:^|\n)[^\n]*[ \t]+(?:\n|$)/u.test(content)) failures.push(`${relative}: contains trailing whitespace`);
  if (content.length > 0 && !content.endsWith('\n')) failures.push(`${relative}: missing final newline`);
}

if (failures.length > 0) throw new Error(`Source hygiene contract failed:\n${failures.join('\n')}`);

async function filesUnder(directory) {
  const patterns = includedExtensions.flatMap((extension) => [
    `**/*${extension}`,
    `.*/*${extension}`,
    `.*/**/*${extension}`,
    `**/.*/**/*${extension}`
  ]);
  return globFiles(directory, patterns, { exclude: ignoredDirectories });
}
