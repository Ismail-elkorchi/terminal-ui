import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const samples = Object.freeze([
  Object.freeze({
    name: 'navigation clamp becomes wrap',
    module: 'dist/interaction/navigation.js',
    from: ': Math.max(0, Math.min(count - 1, candidate));',
    to: ': cyclicIndex(candidate, count);',
    test: 'tests/unit/navigation-behavior.test.ts',
  }),
  Object.freeze({
    name: 'terminal sanitizer preserves an unsafe sequence',
    module: 'dist/text/sanitize.js',
    from: '        return replacement;',
    to: '        return sequence;',
    test: 'tests/unit/text.test.mjs',
  }),
  Object.freeze({
    name: 'initial frame diff dereferences a missing baseline',
    module: 'dist/renderer/frame.js',
    from: '    if (previous?.width !== next.width',
    to: '    if (previous !== undefined && previous.width !== next.width',
    test: 'tests/unit/render-instrumentation.test.mjs',
  }),
]);

for (const sample of samples) await assertMutationIsKilled(sample);

async function assertMutationIsKilled(sample) {
  const fixture = await mkdtemp(join(tmpdir(), 'terminal-ui-mutant-'));
  try {
    await Promise.all([
      cp(join(root, 'dist'), join(fixture, 'dist'), { recursive: true }),
      writeFile(join(fixture, 'package.json'), '{"type":"module"}\n', 'utf8'),
    ]);
    const targetTest = join(fixture, sample.test);
    await mkdir(dirname(targetTest), { recursive: true });
    await cp(join(root, sample.test), targetTest);

    const baseline = await run(process.execPath, ['--test', sample.test], fixture);
    if (baseline.code !== 0) {
      throw new Error(
        `Mutation sample baseline failed: ${sample.name}\n${baseline.output}`,
      );
    }

    const modulePath = join(fixture, sample.module);
    const source = await readFile(modulePath, 'utf8');
    const occurrences = source.split(sample.from).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Mutation sample "${sample.name}" expected one source match but found ${String(occurrences)}.`,
      );
    }
    await writeFile(modulePath, source.replace(sample.from, sample.to), 'utf8');

    const result = await run(process.execPath, ['--test', sample.test], fixture);
    if (result.code === 0) {
      throw new Error(`Mutation sample survived: ${sample.name}\n${result.output}`);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

function run(command, arguments_, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, arguments_, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code: code ?? 1, output }));
  });
}
