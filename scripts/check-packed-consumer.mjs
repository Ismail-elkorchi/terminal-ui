import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { globFiles } from './glob-files.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(projectRoot, 'tests', 'consumer');
const externalComponentRoot = join(projectRoot, 'tests', 'fixtures', 'packed-external-component');
const contractRuntimeRoot = join(projectRoot, 'tests', 'contracts', 'runtime');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'terminal-ui-packed-consumer-'));
const packRoot = join(temporaryRoot, 'package');
const consumerRoot = join(temporaryRoot, 'consumer');
const packedContractScenarios = (await globFiles(contractRuntimeRoot, ['**/*.mjs']))
  .map((path) => relative(contractRuntimeRoot, path).split('\\').join('/'));

try {
  await mkdir(packRoot, { recursive: true });
  const packed = await run('npm', [
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    packRoot
  ], projectRoot);
  const packResult = JSON.parse(packed.stdout);
  const filename = packResult[0]?.filename;
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error(`npm pack did not report a tarball filename.\n${packed.stdout}`);
  }
  const externalPacked = await run('npm', [
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    packRoot
  ], externalComponentRoot);
  const externalPackResult = JSON.parse(externalPacked.stdout);
  const externalFilename = externalPackResult[0]?.filename;
  if (typeof externalFilename !== 'string' || externalFilename.length === 0) {
    throw new Error(`External component npm pack did not report a tarball filename.\n${externalPacked.stdout}`);
  }

  await cp(fixtureRoot, consumerRoot, { recursive: true });
  await cp(contractRuntimeRoot, join(consumerRoot, 'contracts-runtime'), { recursive: true });
  const packagePath = join(consumerRoot, 'package.json');
  const packageSource = await readFile(packagePath, 'utf8');
  await writeFile(
    packagePath,
    packageSource
      .replace('__TERMINAL_UI_TARBALL__', join(packRoot, filename))
      .replace('__EXTERNAL_COMPONENT_TARBALL__', join(packRoot, externalFilename)),
    'utf8'
  );

  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot);
  await assertPeerComponentInstallation(consumerRoot);
  await run(process.execPath, [
    join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--project',
    'tsconfig.json'
  ], consumerRoot);

  const runtimeChecks = [
    { name: 'node', command: process.execPath, args: ['dist/consumer.js'] },
    { name: 'deno', command: 'deno', args: ['run', '--node-modules-dir=manual', 'dist/consumer.js'] },
    { name: 'bun', command: 'bun', args: ['dist/consumer.js'] }
  ];
  for (const runtime of runtimeChecks) {
    const result = await run(runtime.command, runtime.args, consumerRoot);
    if (!result.stdout.includes('terminal-ui packed consumer passed')) {
      throw new Error(`${runtime.name} did not execute the packed consumer successfully.\n${result.stdout}`);
    }
    for (const scenario of packedContractScenarios) {
      const scenarioResult = await run(runtime.command, runtimeArgs(runtime.name, scenario), consumerRoot);
      const payload = JSON.parse(scenarioResult.stdout.trim());
      const expectedResult = scenario.replace(/\.mjs$/u, '').split('/').at(-1);
      if (payload.status !== 'passed' || payload.scenario !== expectedResult) {
        throw new Error(`${runtime.name} returned an invalid contract result for ${scenario}.\n${scenarioResult.stdout}`);
      }
    }
    process.stdout.write(`terminal-ui packed artifact passed under ${runtime.name}\n`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function assertPeerComponentInstallation(consumerRoot) {
  const packageRoot = join(consumerRoot, 'node_modules', 'terminal-ui-peer-component-fixture');
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.peerDependencies?.['@ismail-elkorchi/terminal-ui'] !== '^0.1.0') {
    throw new Error('External component fixture must declare terminal-ui as a peer dependency.');
  }
  const nested = join(packageRoot, 'node_modules', '@ismail-elkorchi', 'terminal-ui');
  try {
    await stat(nested);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('External component fixture installed a private terminal-ui copy instead of its peer.');
}

function runtimeArgs(runtime, scenario) {
  const path = `contracts-runtime/${scenario}`;
  return runtime === 'deno' ? ['run', '--node-modules-dir=manual', path] : [path];
}

async function run(command, args, cwd) {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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
      reject(new Error([
        `Command failed (${String(code)}): ${command} ${args.join(' ')}`,
        stdout,
        stderr
      ].filter((part) => part.length > 0).join('\n')));
    });
  });
}
