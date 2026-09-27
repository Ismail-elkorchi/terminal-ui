import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const ciWorkflow = await workflowSource(new URL('../../.github/workflows/ci.yml', import.meta.url));
const publishWorkflow = await workflowSource(new URL('../../.github/workflows/publish.yml', import.meta.url));
const emulatorWorkflow = await workflowSource(new URL('../../.github/workflows/emulator.yml', import.meta.url));
const sourceRoot = new URL('../../src/', import.meta.url);
const repositoryRoot = new URL('../../', import.meta.url);

test('CI verifies the complete package on Node 24 across Ubuntu, macOS, and Windows', () => {
  const verification = workflowJob(ciWorkflow, 'verify');

  assert.match(verification, /os: \[ubuntu-latest, macos-latest, windows-latest\]/u);
  assert.match(verification, /node-version: 24/u);
  assert.match(verification, /denoland\/setup-deno/u);
  assert.match(verification, /oven-sh\/setup-bun/u);
  for (const command of ['npm ci', 'npm test']) {
    assert.match(verification, new RegExp(`- run: ${command.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
  }
  assert.doesNotMatch(verification, /- run: npm run (?:build|verify)|- run: npm pack --dry-run/u);
});

test('CI verifies graphics through pinned direct and tmux emulator paths', () => {
  const verification = workflowJob(ciWorkflow, 'emulator-real');

  assertReusableEmulatorCall(verification);
  assert.match(verification, /checkout-ref: \$\{\{ github\.sha \}\}/u);
  assert.match(verification, /node-version: '24'/u);
  assert.match(verification, /artifact-prefix: real-emulator-evidence$/mu);
  assert.match(verification, /retention-days: 14/u);

});

test('shared emulator workflow checks the supplied ref and retains every emulator gate', () => {
  assert.match(emulatorWorkflow, /workflow_call:/u);
  const verification = workflowJob(emulatorWorkflow, 'emulator');
  assert.match(verification, /runs-on: ubuntu-24\.04/u);
  assertGraphicsEmulatorMatrix(verification);
  assert.match(verification, /ref: \$\{\{ inputs\.checkout-ref \}\}/u);
  assert.match(verification, /node-version: \$\{\{ inputs\.node-version \}\}/u);
  for (const name of ['kitty', 'tmux', 'xterm', 'wezterm']) {
    assert.ok(verification.includes(`node scripts/emulator/install-${name}.mjs`));
  }
  assert.match(verification, /xvfb-run.*npm run \$\{\{ matrix\.command \}\}/u);
  assert.match(verification, /name: \$\{\{ inputs\.artifact-prefix \}\}-\$\{\{ matrix\.path \}\}/u);
  assert.match(verification, /path: \.artifacts\/emulator\/\$\{\{ matrix\.path \}\}/u);
  assert.match(verification, /retention-days: \$\{\{ inputs\.retention-days \}\}/u);
});

function assertReusableEmulatorCall(job) {
  assert.match(job, /uses: \.\/\.github\/workflows\/emulator\.yml/u);
  assert.doesNotMatch(job, /matrix:|steps:|runs-on:/u);
}

test('registry publication is gated by a verified immutable release tag', () => {
  assert.match(publishWorkflow, /^  release:\n    types: \[published\]$/mu);
  assert.doesNotMatch(publishWorkflow, /^  (?:push|pull_request):/mu);
  assert.match(publishWorkflow, /^  workflow_dispatch:\n    inputs:\n      release_tag:/mu);
  assert.match(publishWorkflow, /registry:\n        description: Registry to retry[\s\S]*?options:\n          - npm\n          - jsr/u);

  const verification = workflowJob(publishWorkflow, 'verify');
  const emulatorVerification = workflowJob(publishWorkflow, 'verify-emulator');
  const npmPublication = workflowJob(publishWorkflow, 'publish-npm');
  const jsrPublication = workflowJob(publishWorkflow, 'publish-jsr');

  assert.match(verification, /npm run check:release/u);
  assert.match(verification, /npm run check$/mu);
  assert.match(verification, /ref: \$\{\{ env\.RELEASE_TAG \}\}/u);
  assertReusableEmulatorCall(emulatorVerification);
  assert.match(emulatorVerification, /checkout-ref: \$\{\{ github\.event\.release\.tag_name \|\| inputs\.release_tag \}\}/u);
  assert.match(emulatorVerification, /node-version: '24\.14\.0'/u);
  assert.match(emulatorVerification, /artifact-prefix: real-emulator-evidence-\$\{\{ github\.event\.release\.tag_name \|\| inputs\.release_tag \}\}/u);
  assert.match(emulatorVerification, /retention-days: 30/u);
  assert.match(npmPublication, /needs: \[verify, verify-emulator\]/u);
  assert.match(npmPublication, /if: github\.event_name == 'release' \|\| inputs\.registry == 'npm'/u);
  assert.match(npmPublication, /runs-on: ubuntu-latest/u);
  assert.match(npmPublication, /id-token: write/u);
  assert.match(npmPublication, /registry-url: https:\/\/registry\.npmjs\.org/u);
  assert.match(npmPublication, /npm publish --access public/u);
  assert.doesNotMatch(npmPublication, /NODE_AUTH_TOKEN|NPM_TOKEN/u);
  assert.match(jsrPublication, /needs: \[verify, verify-emulator\]/u);
  assert.match(jsrPublication, /if: github\.event_name == 'release' \|\| inputs\.registry == 'jsr'/u);
  assert.match(jsrPublication, /id-token: write/u);
  assert.match(jsrPublication, /npm ci --ignore-scripts/u);
  assert.match(jsrPublication, /deno publish/u);
  assert.doesNotMatch(jsrPublication, /NPM_TOKEN|JSR_TOKEN/u);
});

test('element rendering code uses semantic styles instead of raw terminal colors', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/layout/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/internal/', import.meta.url))
  ].filter((file) => ![
    '/src/renderer/internal/ansi.ts',
    '/src/renderer/internal/serialization-policy.ts',
    '/src/renderer/frame.ts'
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

  const anchors = new Map();
  for (const file of docs) {
    const source = await readFile(file, 'utf8');
    anchors.set(file.href, documentationAnchors(source));
  }
  for (const file of docs) {
    const source = await readFile(file, 'utf8');
    for (const link of markdownLinks(source)) {
      if (!isLocalDocumentationLink(link)) continue;
      const target = linkTarget(file, link);
      await access(target);
      const hash = link.split('#')[1];
      if (hash !== undefined && hash !== '' && target.pathname.endsWith('.md')) {
        let targetAnchors = anchors.get(target.href);
        if (targetAnchors === undefined) {
          targetAnchors = documentationAnchors(await readFile(target, 'utf8'));
          anchors.set(target.href, targetAnchors);
        }
        assert.ok(targetAnchors.has(decodeURIComponent(hash)), `${file.pathname}: missing ${link}`);
      }
    }
  }
});

test('renderer layer contains no clipboard or raw ANSI escape hatches', async () => {
  const files = [
    ...await sourceFiles(new URL('../../src/components/', import.meta.url)),
    ...await sourceFiles(new URL('../../src/renderer/', import.meta.url))
  ].filter((file) => !file.pathname.endsWith('/src/renderer/internal/serialization-policy.ts'));
  const forbiddenPatterns = [
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

async function workflowSource(file) {
  return (await readFile(file, 'utf8')).replace(/\r\n?/gu, '\n');
}

function workflowJob(source, jobId) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.notEqual(start, -1, `Missing CI job ${jobId}.`);
  const followingJob = lines.slice(start + 1).findIndex((line) => /^  [a-z][a-z0-9-]*:$/u.test(line));
  const end = followingJob === -1 ? lines.length : start + 1 + followingJob;
  return lines.slice(start, end).join('\n');
}

function assertGraphicsEmulatorMatrix(job) {
  const paths = [
    ['kitty-direct', 'check:emulator:kitty'],
    ['kitty-tmux', 'check:emulator:kitty-tmux'],
    ['sixel-direct', 'check:emulator:sixel'],
    ['sixel-tmux', 'check:emulator:sixel-tmux'],
    ['sixel-wezterm', 'check:emulator:wezterm']
  ];

  for (const [path, command] of paths) {
    assert.match(job, new RegExp(
      `^          - path: ${path}\\n(?:            [^\\n]+\\n)*?            command: ${command}$`,
      'mu',
    ));
  }
}

async function exampleSourceFiles() {
  return [
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.ts'),
    ...await sourceFiles(new URL('../../examples/', import.meta.url), '.mjs')
  ].sort((left, right) => left.pathname.localeCompare(right.pathname));
}

function markdownLinks(source) {
  return [...source.matchAll(/(?<!!)\[[^\]]+\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)]
    .map((match) => match.groups?.target)
    .filter((target) => typeof target === 'string');
}

function isLocalDocumentationLink(link) {
  return !link.startsWith('http://')
    && !link.startsWith('https://')
    && !link.startsWith('mailto:')
    && !link.startsWith('file:');
}

function documentationAnchors(source) {
  const anchors = new Set([...source.matchAll(/<a\s+id="([^"]+)"\s*><\/a>/gu)]
    .map((match) => match[1]));
  const used = new Map();
  let inFence = false;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = /^#{1,6}\s+(.+)$/u.exec(line)?.[1];
    if (heading === undefined) continue;
    const base = heading.toLowerCase()
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
      .replace(/<[^>]+>/gu, '')
      .replace(/[^\p{L}\p{N}_ -]/gu, '')
      .replace(/ /gu, '-');
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return anchors;
}

function linkTarget(file, link) {
  const [path] = link.split('#');
  if (path === undefined || path.length === 0) return file;
  return path.startsWith('/')
    ? new URL(`.${path}`, repositoryRoot)
    : new URL(path, file);
}
