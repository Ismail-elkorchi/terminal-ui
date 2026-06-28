import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { exampleScripts } from '../tests/package/example-list.mjs';

const checkOnly = process.argv.includes('--check');
const root = fileURLToPath(new URL('..', import.meta.url));
const outputDirectory = new URL('../tests/fixtures/example-output/', import.meta.url);

const files = new Map([
  ...exampleScripts.map((example) => [`${example}.stdout.txt`, runExample(example)]),
  ['manifest.json', `${JSON.stringify({
    schemaVersion: 'terminal-ui.example-output-fixtures.v1',
    source: 'scripts/render-example-fixtures.mjs',
    generatedFrom: 'tests/package/example-list.mjs',
    files: exampleScripts.map((example) => `${example}.stdout.txt`)
  }, null, 2)}\n`]
]);

if (checkOnly) {
  await checkFixtures(files);
} else {
  await writeFixtures(files);
}

function runExample(example) {
  const result = spawnSync(process.execPath, [example], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error([
      `Example failed: ${example}`,
      result.stderr,
      result.stdout
    ].filter(Boolean).join('\n'));
  }
  if (result.stderr !== '') {
    throw new Error(`Example wrote to stderr: ${example}\n${result.stderr}`);
  }
  return result.stdout.replaceAll('\r\n', '\n');
}

async function writeFixtures(expectedFiles) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([...expectedFiles].map(async ([name, content]) => {
    const target = new URL(name, outputDirectory);
    await mkdir(dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, content, 'utf8');
  }));
}

async function checkFixtures(expectedFiles) {
  const mismatches = [];
  const expectedNames = new Set(expectedFiles.keys());
  for (const [name, expected] of expectedFiles) {
    const target = new URL(name, outputDirectory);
    let actual;
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      mismatches.push(`${name}: missing`);
      continue;
    }
    if (actual !== expected) mismatches.push(`${name}: stale`);
  }
  for (const actual of await listFixtureFiles(outputDirectory)) {
    if (!expectedNames.has(actual)) mismatches.push(`${actual}: stale extra`);
  }
  if (mismatches.length > 0) {
    throw new Error([
      'Example output fixtures are stale.',
      `Run from ${root}: node scripts/render-example-fixtures.mjs`,
      ...mismatches
    ].join('\n'));
  }
}

async function listFixtureFiles(directory) {
  const rootPath = fileURLToPath(directory);
  const output = [];
  await collectFiles(rootPath, output);
  return output.map((path) => relative(rootPath, path).replaceAll('\\', '/')).sort();
}

async function collectFiles(directory, output) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectFiles(path, output);
      return;
    }
    if (entry.isFile()) output.push(path);
  }));
}
