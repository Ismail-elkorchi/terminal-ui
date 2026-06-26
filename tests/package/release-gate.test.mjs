import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const sourceRoot = new URL('../../src/', import.meta.url);

const requiredCheckScripts = [
  'check:runtime',
  'check:jsr',
  'check:fixtures',
  'check:acceptance',
  'check:conformance',
  'check:integration',
  'check:package',
  'check:performance',
  'check:property',
  'check:security',
  'check:unit'
];

test('release check is composed from explicit product suite lanes', () => {
  const scripts = packageJson.scripts;
  assert.equal(typeof scripts.lint, 'string');
  assert.equal(typeof scripts.build, 'string');
  assert.equal(typeof scripts.check, 'string');

  for (const scriptName of requiredCheckScripts) {
    assert.equal(typeof scripts[scriptName], 'string', scriptName);
    assert.ok(scripts.check.includes(`npm run ${scriptName}`), scriptName);
  }
});

test('terminal-ui source does not own low-level argv tokenization', async () => {
  const files = await sourceFiles(sourceRoot);
  const forbiddenPatterns = [
    /\bsplitShellCommandLine\b/u,
    /\bsplitArgv\b/u,
    /\btokenizeArgv\b/u,
    /\bcommand-line\.ts\b/u,
    /input\.split\(\s*\/\\s\+/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('TUI render, layout, and accessibility delegate widget behavior through the registry', async () => {
  const centralFiles = [
    '../../src/tui/render.ts',
    '../../src/tui/layout.ts',
    '../../src/tui/render-accessibility.ts'
  ];
  for (const relativePath of centralFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /switch\s*\(\s*widget\.kind\s*\)/u, relativePath);
    assert.doesNotMatch(source, /case\s+['"`](?:text|box|stack|row|list|table|inputField|statusBar|progressBar|spinner|viewport|custom)['"`]/u, relativePath);
  }

  const registry = await readFile(new URL('../../src/tui/widget-behavior.ts', import.meta.url), 'utf8');
  assert.match(registry, /satisfies Record<WidgetKind, WidgetBehavior>/u);
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(new URL(`${entry.name}/`, directory)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(child);
  }
  return files.sort((left, right) => left.pathname.localeCompare(right.pathname));
}
