import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ciWorkflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const sourceRoot = new URL('../../src/', import.meta.url);
const repositoryRoot = new URL('../../', import.meta.url);

test('host smoke CI runs only the installed Node runtime coverage', () => {
  const hostSmoke = workflowJob(ciWorkflow, 'host-smoke');
  const linuxFull = workflowJob(ciWorkflow, 'linux-full');

  assert.match(hostSmoke, /node scripts\/runtime-smoke\.mjs/u);
  assert.match(hostSmoke, /node --test tests\/integration\/node-host-lifecycle\.test\.mjs/u);
  assert.doesNotMatch(hostSmoke, /tests\/runtime\/runtime-smoke\.test\.mjs|npm run check:runtime/u);
  assert.match(linuxFull, /denoland\/setup-deno/u);
  assert.match(linuxFull, /oven-sh\/setup-bun/u);
  assert.match(linuxFull, /npm run check:runtime/u);
});

test('element and renderer modules do not write through terminal hosts', async () => {
  const renderingFiles = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/layout/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/', import.meta.url))
  ];
  const forbiddenPatterns = [
    /\bhost\.write\s*\(/u
  ];

  for (const file of renderingFiles) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('element rendering code uses semantic styles instead of raw terminal colors', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/layout/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/', import.meta.url))
  ].filter((file) => ![
    '/src/renderer/internal/ansi.ts',
    '/src/renderer/internal/serialization-policy.ts',
    '/src/renderer/internal/frame.ts'
  ].some((suffix) => file.pathname.endsWith(suffix)));
  const forbiddenPatterns = [
    /\bkind:\s*['"]ansi['"]/u,
    /\bkind:\s*['"]rgb['"]/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('documentation local links resolve', async () => {
  const docs = [
    new URL('../../README.md', import.meta.url),
    ...await sourceFiles(new URL('../../docs/', import.meta.url), '.md')
  ];

  for (const file of docs) {
    const source = await readFile(file, 'utf8');
    for (const link of markdownLinks(source)) {
      if (!isLocalDocumentationLink(link)) continue;
      const target = linkTarget(file, link);
      await access(target);
    }
  }
});

test('renderer layer has no command, clipboard, or raw ANSI side effects', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/charts/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/canvas2d/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/frame-passes/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/forms/', import.meta.url)),
    ...await namedRendererSourceFiles([
      'border.ts',
      'command-input.ts',
      'data-rendering.ts',
      'drawing-rendering.ts',
      'menu-rendering.ts',
      'search-picker.ts',
      'log-viewer.ts',
      'structured-block.ts',
      'table.ts',
      'text-rendering.ts',
      'tree.ts',
      'render-node-behavior.ts',
      '../model/renderer.ts'
    ])
  ];
  const forbiddenPatterns = [
    /\bnode:child_process\b/u,
    /\bchild_process\b/u,
    /\bspawn\s*\(/u,
    /\bexec(?:File)?\s*\(/u,
    /\bclipboard\b/iu,
    /\bnavigator\.clipboard\b/u,
    /\bwriteText\s*\(/u,
    /\\u001[Bb]|\\x1b|\\033/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('examples use scheduler sources instead of raw timers', async () => {
  const files = await exampleSourceFiles();
  const forbiddenPatterns = [
    /\bsetTimeout\s*\(/u,
    /\bsetInterval\s*\(/u
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, file.pathname);
    }
  }
});

test('terminal text indexing and editing stay centralized', async () => {
  const sourceFilesToCheck = [
    ...await sourceFiles(sourceRoot),
    ...await exampleSourceFiles()
  ];
  const textSources = [
    '/src/text/graphemes.ts',
    '/src/text/measure.ts',
    '/src/text/terminal-text-index.ts'
  ];

  for (const file of sourceFilesToCheck) {
    const source = await readFile(file, 'utf8');
    if (!textSources.some((suffix) => file.pathname.endsWith(suffix))) {
      assert.doesNotMatch(source, /\bnew Intl\.Segmenter\b/u, file.pathname);
      assert.doesNotMatch(source, /Extended_Pictographic/u, file.pathname);
    }
  }
});

async function sourceFiles(directory, extension = '.ts') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(new URL(`${entry.name}/`, directory), extension));
      continue;
    }
    if (entry.isFile()
      && entry.name.endsWith(extension)
      && !(extension === '.ts' && entry.name.endsWith('.test.ts'))) {
      files.push(child);
    }
  }
  return files.sort((left, right) => left.pathname.localeCompare(right.pathname));
}

function workflowJob(source, jobId) {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.notEqual(start, -1, `Missing CI job ${jobId}.`);
  const followingJob = lines.slice(start + 1).findIndex((line) => /^  [a-z][a-z0-9-]*:$/u.test(line));
  const end = followingJob === -1 ? lines.length : start + 1 + followingJob;
  return lines.slice(start, end).join('\n');
}

async function exampleSourceFiles() {
  return [
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.ts'),
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.mjs')
  ].sort((left, right) => left.pathname.localeCompare(right.pathname));
}

async function namedRendererSourceFiles(names) {
  return names.map((name) => new URL(`../../src/renderer/internal/${name}`, import.meta.url));
}

function markdownLinks(source) {
  return [...source.matchAll(/(?<!!)\[[^\]]+\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)]
    .map((match) => match.groups?.target)
    .filter((target) => typeof target === 'string');
}

function isLocalDocumentationLink(link) {
  return !link.startsWith('#')
    && !link.startsWith('http://')
    && !link.startsWith('https://')
    && !link.startsWith('mailto:')
    && !link.startsWith('file:');
}

function linkTarget(file, link) {
  const [path] = link.split('#');
  if (path === undefined || path.length === 0) return file;
  return path.startsWith('/')
    ? new URL(`.${path}`, repositoryRoot)
    : new URL(path, file);
}
