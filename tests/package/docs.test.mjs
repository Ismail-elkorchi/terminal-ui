import assert from 'node:assert/strict';
import { access, glob, readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatTypeDiagnostic, typecheckSources } from './support/typecheck.mjs';

const requiredDocs = [
  'docs/index.md',
  'docs/api/index.md',
  'docs/guides/runtime-support.md',
  'docs/guides/text.md',
  'docs/guides/prompts.md',
  'docs/guides/tui.md',
  'docs/guides/ui-authoring.md',
  'docs/guides/components.md',
  'docs/guides/behavior.md',
  'docs/guides/public-ui-authoring-model.md',
  'docs/guides/rendering-internals.md',
  'docs/guides/building-polished-components.md',
  'docs/guides/themes.md',
  'docs/guides/renderer-extensions.md',
  'docs/guides/layout.md',
  'docs/guides/host-adapters.md',
  'docs/accessibility.md',
  'docs/guides/transcript-replay.md',
  'docs/guides/non-tty.md',
  'docs/security.md',
  'docs/guides/testing-harness.md'
];

const executableExampleLinks = [
  'examples/prompts/non-tty-input.mjs',
  'examples/testing/harness.mjs',
  'examples/tui/interactive-workspace.ts',
  'examples/tui/ide-editor.ts',
  'examples/tui/btop-monitor.ts'
];

const documentationPaths = ['README.md'];
for await (const path of glob('docs/**/*.md')) documentationPaths.push(path);
documentationPaths.sort((left, right) => left.localeCompare(right));

test('documentation covers required product guide families', async () => {
  for (const path of requiredDocs) {
    await access(new URL(`../../${path}`, import.meta.url));
  }

  const index = await readFile(new URL('../../docs/index.md', import.meta.url), 'utf8');
  for (const path of requiredDocs.slice(1)) {
    const relative = path.replace('docs/', './');
    assert.ok(index.includes(relative), path);
  }
});

test('documentation points to executable public examples and avoids workbench paths', async () => {
  const docs = await Promise.all(
    requiredDocs.map((path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
  );
  const combined = docs.join('\n');

  for (const path of executableExampleLinks) {
    assert.ok(combined.includes(path), path);
    await access(new URL(`../../${path}`, import.meta.url));
  }

  assert.equal(combined.includes('tse-workbench'), false);
  assert.equal(combined.includes('Documents/Projects'), false);
});

test('documentation describes layered authoring instead of the removed widget surface', async () => {
  const docs = await Promise.all(
    requiredDocs.map((path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
  );
  const combined = docs.join('\n');

  for (const term of [
    'docs/guides/widgets.md',
    'docs/guides/custom-widgets.md',
    'docs/guides/building-polished-widgets.md',
    'Widgets are pure data descriptions',
    'Widget Role Matrix',
    'everything is widgets'
  ]) {
    assert.equal(combined.includes(term), false, term);
  }

  for (const term of [
    'UI authoring',
    'Components',
    'Behavior helpers',
    'Renderer extensions',
    'Building polished components',
    'Element<TMessage>',
    'RenderNode<TMessage>'
  ]) {
    assert.ok(combined.includes(term), term);
  }
});

test('rendering documentation describes current architecture without deferred API names', async () => {
  const rendering = await readFile(new URL('../../docs/guides/rendering-internals.md', import.meta.url), 'utf8');
  const polished = await readFile(new URL('../../docs/guides/building-polished-components.md', import.meta.url), 'utf8');
  const combined = `${rendering}\n${polished}`;

  for (const term of [
    'styled cells',
    'RenderSpan',
    'RenderBlock',
    'FrameBuffer',
    'diffFrames()',
    'renderFrameAnsi()',
    'renderDiffAnsi()',
    'themes',
    'symbols',
    'layout',
    'hit targets',
    'focus targets',
    'accessibility',
    'snapshots',
    'custom()',
    'canvas()'
  ]) {
    assert.ok(combined.includes(term), term);
  }

  assert.equal(combined.includes('includeControlSequences'), false);
  assert.equal(combined.includes('compatibility'), false);
  assert.equal(combined.includes('P0.5'), false);
});

test('documentation TypeScript and JavaScript snippets typecheck against the built package', async () => {
  const snippets = [];
  for (const path of documentationPaths) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    let index = 0;
    for (const snippet of codeSnippets(source)) {
      index += 1;
      snippets.push({
        source: snippet.code,
        language: snippet.language,
        name: `${path}-${String(index)}`
      });
    }
  }
  const diagnostics = typecheckSources(snippets);
  assert.deepEqual(
    diagnostics.map((diagnostic) => formatTypeDiagnostic(diagnostic)),
    []
  );
});

function codeSnippets(source) {
  return [...source.matchAll(/```(?<language>ts|typescript|js|javascript)\n(?<code>[\s\S]*?)```/gu)]
    .map((match) => ({
      language: match.groups?.language ?? 'ts',
      code: match.groups?.code ?? ''
    }));
}
