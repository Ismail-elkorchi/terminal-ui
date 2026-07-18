import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contractScenarios } from '../tests/contracts/matrix.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsrJson = JSON.parse(await readFile(join(projectRoot, 'jsr.json'), 'utf8'));
const packageName = jsrJson.name;
const temporaryRoot = await mkdtemp(join(tmpdir(), 'terminal-ui-jsr-runtime-'));

try {
  const imports = {};
  for (const [entrypoint, sourcePath] of Object.entries(jsrJson.exports)) {
    const specifier = entrypoint === '.' ? packageName : `${packageName}${entrypoint.slice(1)}`;
    imports[specifier] = pathToFileURL(resolve(projectRoot, sourcePath)).href;
  }
  const importMapPath = join(temporaryRoot, 'import-map.json');
  await writeFile(importMapPath, `${JSON.stringify({ imports }, null, 2)}\n`, 'utf8');

  const scenarios = [...new Set(contractScenarios
    .filter((scenario) => scenario.contracts.includes('portable_runtime')
      || scenario.id === 'schemas:jsr-artifacts')
    .map((scenario) => scenario.path))];
  for (const scenarioPath of scenarios) {
    const result = await run('deno', [
      'run',
      '--quiet',
      `--allow-read=${projectRoot}`,
      '--import-map',
      importMapPath,
      resolve(projectRoot, scenarioPath)
    ]);
    const payload = JSON.parse(result.stdout.trim());
    if (payload.ok !== true) throw new Error(`JSR scenario ${scenarioPath} did not report success.`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function run(command, args) {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolveResult({ stdout, stderr });
        return;
      }
      reject(new Error([`Command failed (${String(code)}): ${command} ${args.join(' ')}`, stdout, stderr]
        .filter((part) => part.length > 0)
        .join('\n')));
    });
  });
}
