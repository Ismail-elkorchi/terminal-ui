import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(projectRoot, 'tests', 'consumer');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'terminal-ui-packed-consumer-'));
const packRoot = join(temporaryRoot, 'package');
const consumerRoot = join(temporaryRoot, 'consumer');

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

  await cp(fixtureRoot, consumerRoot, { recursive: true });
  const packagePath = join(consumerRoot, 'package.json');
  const packageSource = await readFile(packagePath, 'utf8');
  await writeFile(
    packagePath,
    packageSource.replace('__TERMINAL_UI_TARBALL__', join(packRoot, filename)),
    'utf8'
  );

  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot);
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
    process.stdout.write(`terminal-ui packed artifact passed under ${runtime.name}\n`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
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
