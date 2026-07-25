import assert from 'node:assert/strict';
import { glob, readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatTypeDiagnostic, typecheckSources } from './support/typecheck.mjs';

const documentationPaths = ['README.md'];
for await (const path of glob('docs/**/*.md')) documentationPaths.push(path);
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

function codeSnippets(source) {
  return [...source.matchAll(/```(?<language>ts|typescript|js|javascript)\n(?<code>[\s\S]*?)```/gu)]
    .map((match) => ({
      language: match.groups?.language ?? 'ts',
      code: match.groups?.code ?? ''
    }));
}
