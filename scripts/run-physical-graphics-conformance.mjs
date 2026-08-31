import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const options = parseOptions(process.argv.slice(2));
const protocol = requiredChoice(options, 'protocol', ['kitty', 'sixel']);
const terminal = requiredText(options, 'terminal');
const terminalVersion = requiredText(options, 'terminal-version');
const transport = requiredChoice(
  options,
  'transport',
  protocol === 'kitty' ? ['direct', 'tmux-passthrough'] : ['direct', 'tmux-native'],
);
const visibleScreenshot = path.resolve(requiredText(options, 'visible-screenshot'));
const hiddenScreenshot = path.resolve(requiredText(options, 'hidden-screenshot'));
const evidenceDirectory = path.resolve(
  options.get('output')
    ?? path.join(root, '.artifacts', 'emulator', 'physical', evidenceSlug(terminal, terminalVersion, protocol, transport)),
);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-physical-graphics-'));
const reportPath = path.join(temporary, 'report.json');
const commit = (await command('git', ['rev-parse', 'HEAD'])).trim();
const status = await command('git', ['status', '--short']);
if (status.trim() !== '') {
  throw new Error('Physical graphics evidence must be recorded from a clean worktree bound to one exact commit.');
}
const insideTmux = process.env.TMUX !== undefined;
if (insideTmux !== transport.startsWith('tmux-')) {
  throw new Error(`The requested ${transport} transport does not match the active tmux environment.`);
}

process.stdout.write([
  'Physical graphics conformance requires direct observation.',
  'During the probe: type alpha, paste -paste, press F2, click the Pointer target with left/right/middle buttons,',
  'capture the visible screenshot, press F4, capture the hidden screenshot, then press F10.',
  '',
].join('\n'));

try {
  await run(process.execPath, [
    path.join(root, 'tests', 'emulator', 'graphics-probe.mjs'),
    reportPath,
    protocol,
  ]);
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assert.equal(report.status, 'completed');
  assert.equal(report.reason, 'emulator-conformance-complete');
  assert.equal(report.state.input.text, 'alpha-paste');
  assert.ok(report.state.keyPresses >= 1);
  assert.ok(report.state.pointerActivations.left >= 1);
  assert.ok(report.state.pointerActivations.middle >= 1);
  assert.ok(report.state.pointerActivations.right >= 1);
  assert.equal(report.state.imageVisible, false);
  assert.deepEqual(report.diagnostics.filter(({ severity }) => severity === 'error' || severity === 'fatal'), []);
  if (protocol === 'kitty') {
    assert.equal(report.state.graphics.kittySupport, 'supported');
    assert.equal(report.state.graphics.kittyTransport, transport);
  } else {
    assert.equal(report.state.graphics.sixelSupport, 'supported');
  }

  const screenshots = {
    visible: await fileEvidence(visibleScreenshot),
    hidden: await fileEvidence(hiddenScreenshot),
  };
  if (screenshots.visible.sha256 === screenshots.hidden.sha256) {
    throw new Error('Visible and removed graphics screenshots must be different images.');
  }
  const evidence = {
    schemaVersion: 1,
    terminalUiCommit: commit,
    worktreeClean: true,
    recordedAt: new Date().toISOString(),
    terminal: { name: terminal, version: terminalVersion },
    protocol,
    transport,
    operatingSystem: {
      platform: process.platform,
      release: os.release(),
      architecture: process.arch,
    },
    display: {
      sessionType: process.env.XDG_SESSION_TYPE,
      waylandDisplay: process.env.WAYLAND_DISPLAY,
      x11Display: process.env.DISPLAY,
    },
    environment: {
      TERM: process.env.TERM,
      TERM_PROGRAM: process.env.TERM_PROGRAM,
      TERM_PROGRAM_VERSION: process.env.TERM_PROGRAM_VERSION,
      COLORTERM: process.env.COLORTERM,
      tmux: insideTmux,
    },
    report,
    screenshots,
  };
  await fs.mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(evidenceDirectory, 'evidence.json'),
    `${JSON.stringify(evidence, undefined, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.copyFile(visibleScreenshot, path.join(evidenceDirectory, 'graphics-visible.png'));
  await fs.copyFile(hiddenScreenshot, path.join(evidenceDirectory, 'graphics-hidden.png'));
  await fs.chmod(path.join(evidenceDirectory, 'graphics-visible.png'), 0o600);
  await fs.chmod(path.join(evidenceDirectory, 'graphics-hidden.png'), 0o600);
  process.stdout.write(`Physical evidence written to ${evidenceDirectory}\n`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

function parseOptions(arguments_) {
  const allowed = new Set([
    'hidden-screenshot',
    'output',
    'protocol',
    'terminal',
    'terminal-version',
    'transport',
    'visible-screenshot',
  ]);
  const parsed = new Map();
  for (const argument of arguments_) {
    const match = /^--([^=]+)=(.*)$/u.exec(argument);
    if (
      match?.[1] === undefined
      || match[2] === undefined
      || !allowed.has(match[1])
      || parsed.has(match[1])
    ) {
      throw new Error('Physical conformance options must be supported, unique --name=value arguments.');
    }
    parsed.set(match[1], match[2]);
  }
  return parsed;
}

function requiredText(options_, name) {
  const value = options_.get(name);
  if (value === undefined || value.trim() === '') throw new Error(`--${name} is required.`);
  return value;
}

function requiredChoice(options_, name, choices) {
  const value = requiredText(options_, name);
  if (!choices.includes(value)) {
    throw new Error(`--${name} must be one of: ${choices.join(', ')}.`);
  }
  return value;
}

async function fileEvidence(filePath) {
  const bytes = await fs.readFile(filePath);
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !pngSignature.every((byte, index) => bytes[index] === byte)) {
    throw new Error(`Physical evidence must be a valid PNG screenshot: ${filePath}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error(`Physical evidence PNG has invalid dimensions: ${filePath}`);
  return {
    fileName: path.basename(filePath),
    byteLength: bytes.length,
    width,
    height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function evidenceSlug(...parts) {
  return parts.join('-').toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-|-$/gu, '');
}

async function command(executable, arguments_) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const errors = [];
    const child = spawn(executable, arguments_, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
      else reject(new Error(`${executable} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}: ${Buffer.concat(errors).toString('utf8')}`));
    });
  });
}

async function run(executable, arguments_) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}.`));
    });
  });
}
