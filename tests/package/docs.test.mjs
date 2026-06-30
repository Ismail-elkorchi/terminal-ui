import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const requiredDocs = [
  'docs/index.md',
  'docs/api/index.md',
  'docs/guides/runtime-support.md',
  'docs/guides/text.md',
  'docs/guides/prompts.md',
  'docs/guides/shell.md',
  'docs/guides/tui.md',
  'docs/guides/widgets.md',
  'docs/guides/rendering-internals.md',
  'docs/guides/building-polished-widgets.md',
  'docs/guides/themes.md',
  'docs/guides/custom-widgets.md',
  'docs/guides/layout.md',
  'docs/guides/host-adapters.md',
  'docs/accessibility.md',
  'docs/guides/transcript-replay.md',
  'docs/guides/non-tty.md',
  'docs/security.md',
  'docs/guides/testing-harness.md',
  'docs/guides/migration.md'
];

const executableExampleLinks = [
  'examples/showcase/app.mjs',
  'examples/showcase/scripted.mjs',
  'examples/showcase/preview.mjs',
  'examples/gallery/animation-sequences.mjs',
  'examples/files/file-dialog.mjs',
  'examples/products/file-manager.mjs',
  'examples/products/system-monitor.mjs',
  'examples/products/notes-workspace.mjs',
  'examples/products/data-dashboard.mjs',
  'examples/products/form-wizard.mjs',
  'examples/products/chart-explorer.mjs',
  'examples/prompts/non-tty-input.mjs',
  'examples/shell/cli-core-shell.mjs',
  'examples/testing/visual-snapshots.mjs',
  'examples/testing/harness.mjs'
];

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

test('rendering documentation describes current architecture without deferred API names', async () => {
  const rendering = await readFile(new URL('../../docs/guides/rendering-internals.md', import.meta.url), 'utf8');
  const polished = await readFile(new URL('../../docs/guides/building-polished-widgets.md', import.meta.url), 'utf8');
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

test('documentation TypeScript and JavaScript snippets compile', async () => {
  const docs = [
    'README.md',
    ...requiredDocs
  ];
  for (const path of docs) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    for (const snippet of codeSnippets(source)) {
      const result = ts.transpileModule(snippet.code, {
        compilerOptions: {
          allowJs: snippet.language === 'js' || snippet.language === 'javascript',
          isolatedModules: true,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          noEmitOnError: true,
          strict: true,
          target: ts.ScriptTarget.ES2024
        },
        fileName: `${path}.${snippet.language === 'ts' || snippet.language === 'typescript' ? 'ts' : 'js'}`,
        reportDiagnostics: true
      });
      assert.deepEqual(result.diagnostics ?? [], [], `${path} ${snippet.language} snippet:\n${snippet.code}`);
    }
  }
});

function codeSnippets(source) {
  return [...source.matchAll(/```(?<language>ts|typescript|js|javascript)\n(?<code>[\s\S]*?)```/gu)]
    .map((match) => ({
      language: match.groups?.language ?? 'ts',
      code: match.groups?.code ?? ''
    }));
}
