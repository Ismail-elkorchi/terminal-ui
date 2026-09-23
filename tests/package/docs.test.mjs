import assert from 'node:assert/strict';
import { glob, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';
import { formatTypeDiagnostic, typecheckSources } from './support/typecheck.mjs';

const documentationPaths = ['README.md'];
for await (const path of glob('docs/**/*.md')) {
  if (path !== 'docs/api/reference.md') documentationPaths.push(path);
}
documentationPaths.sort((left, right) => left.localeCompare(right));

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

test('documented component, canvas, and harness recipes execute through public imports', async () => {
  const recipes = [
    { path: 'docs/guides/component-definitions.md', index: 0 },
    { path: 'docs/guides/component-definitions.md', index: 1, output: ['one', 'two', 'three', 'four'] },
    { path: 'docs/guides/graphics.md', index: 0, output: ['Build preview'] },
    { path: 'docs/guides/graphics.md', index: 1, output: ['.Ready'] },
    { path: 'docs/guides/testing-harness.md', index: 0 },
    { path: 'docs/guides/testing-harness.md', index: 1 },
  ];
  for (const recipe of recipes) {
    const source = await readFile(new URL(`../../${recipe.path}`, import.meta.url), 'utf8');
    const snippet = codeSnippets(source)[recipe.index];
    assert.ok(snippet, `Missing recipe ${recipe.path}#${String(recipe.index)}`);
    const compiled = ts.transpileModule(snippet.code, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    }).outputText;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', compiled], {
      cwd: new URL('../..', import.meta.url), encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(run.status, 0, `${recipe.path}#${String(recipe.index)}: ${run.stderr}`);
    for (const expected of recipe.output ?? []) {
      assert.ok(run.stdout.includes(expected), `${recipe.path}#${String(recipe.index)} omitted ${expected}: ${run.stdout}`);
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
