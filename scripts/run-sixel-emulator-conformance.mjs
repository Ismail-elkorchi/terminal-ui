import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isGraphicsProbeCleared, measureGraphicsProbe } from './graphics-probe-pixels.mjs';

const root = path.resolve(import.meta.dirname, '..');
const xterm = path.resolve(requiredEnvironmentPath('TERMINAL_UI_XTERM'));
const tmuxMode = process.argv.includes('--tmux');
const tmux = tmuxMode ? path.resolve(requiredEnvironmentPath('TERMINAL_UI_TMUX')) : undefined;
const evidenceName = tmuxMode ? 'sixel-tmux' : 'sixel-direct';
const artifacts = path.resolve(
  process.env.TERMINAL_UI_EMULATOR_ARTIFACTS
    ?? path.join(root, '.artifacts', 'emulator', evidenceName),
);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), `terminal-ui-${evidenceName}-`));
const reportPath = path.join(temporary, 'report.json');
const checkpointPath = path.join(temporary, 'checkpoint.json');
const tmuxSocket = path.join(temporary, 'tmux.sock');
const tmuxConfig = path.join(temporary, 'tmux.conf');
const visibleScreenshot = path.join(artifacts, 'graphics-visible.png');
const hiddenScreenshot = path.join(artifacts, 'graphics-hidden.png');
const processLog = [];
let emulatorProcess;

await fs.mkdir(artifacts, { recursive: true });
await clearPreviousArtifacts();
await assertExecutable(xterm);
if (tmux !== undefined) await assertExecutable(tmux);
const xdotool = await findExecutable('xdotool');
const xwininfo = await findExecutable('xwininfo');
const imageMagick = await imageMagickCommands();
const xtermIdentity = (await command(xterm, ['-version'])).trim();
assert.match(xtermIdentity, /XTerm\(411\)/u);
const tmuxIdentity = tmux === undefined ? undefined : (await command(tmux, ['-V'])).trim();
if (tmuxIdentity !== undefined) assert.equal(tmuxIdentity, 'tmux 3.7c');

try {
  if (tmux !== undefined) {
    await fs.writeFile(tmuxConfig, [
      'set -g status off',
      'set -g allow-passthrough off',
      'set -g default-terminal tmux-256color',
      "set -as terminal-features ',xterm*:RGB'",
      '',
    ].join('\n'), { mode: 0o600 });
  }
  emulatorProcess = launchXterm();
  const windowId = await waitForXtermWindow();
  await waitForCheckpoint((state) => state.graphics.sixelSupport === 'supported', 'SIXEL capability');

  const initial = await checkpoint();
  assert.equal(initial.graphics.kittySupport, 'unsupported');
  assert.equal(initial.graphics.sixelSupport, 'supported');
  assert.equal(initial.graphics.sixelAvailability, 'available');
  assert.equal(typeof initial.graphics.cellPixels, 'object');

  await command(xdotool, ['windowfocus', '--sync', windowId]);
  await command(xdotool, ['type', '--window', windowId, '--delay', '1', 'alpha']);
  await waitForCheckpoint((state) => state.input.text === 'alpha', 'typed input');

  const visiblePixels = await waitUntil(async () => {
    await screenshot(windowId, visibleScreenshot);
    const candidate = await colorPixels(visibleScreenshot);
    return candidate.red.count > 100 && candidate.green.count > 100 ? candidate : undefined;
  }, 'painted SIXEL image');
  assertGraphicGeometry(visiblePixels, initial.graphics.cellPixels, 12, 5);
  assertGraphicAboveScrollBoundary(visiblePixels, initial.graphics.cellPixels, initial.terminalSize.rows);

  if (tmux !== undefined) {
    await command(tmux, ['-S', tmuxSocket, 'refresh-client', '-S']);
    await waitUntil(async () => (await colorPixelsAfterScreenshot(windowId, 'graphics-refreshed.png')).probe.count > 100,
      'tmux SIXEL redraw');
  }

  await command(xdotool, ['key', '--window', windowId, 'F4']);
  await waitForCheckpoint((state) => state.imageVisible === false, 'image removal');
  const hiddenPixels = await waitUntil(async () => {
    await screenshot(windowId, hiddenScreenshot);
    const candidate = await colorPixels(hiddenScreenshot, visiblePixels.probe);
    return isGraphicsProbeCleared(visiblePixels, candidate) ? candidate : undefined;
  }, 'SIXEL image cleanup');

  await command(xdotool, ['key', '--window', windowId, 'F10']);
  await waitUntil(async () => await exists(reportPath), 'probe report');
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  assertProbeReport(report);
  await fs.writeFile(path.join(artifacts, 'evidence.json'), `${JSON.stringify({
    emulator: xtermIdentity,
    multiplexer: tmuxIdentity,
    displayServer: 'x11',
    display: process.env.DISPLAY,
    softwareRendering: process.env.LIBGL_ALWAYS_SOFTWARE === '1',
    protocol: 'sixel',
    path: tmuxMode ? 'tmux-native' : 'direct',
    visiblePixels,
    hiddenPixels,
  }, undefined, 2)}\n`);
  console.log(`SIXEL ${tmuxMode ? 'through tmux' : 'direct'} emulator conformance passed.`);
} finally {
  await fs.writeFile(path.join(artifacts, 'emulator.log'), processLog.join(''));
  if (emulatorProcess !== undefined && emulatorProcess.exitCode === null) {
    emulatorProcess.kill('SIGTERM');
    await waitForExit(emulatorProcess, 2_000).catch(() => emulatorProcess.kill('SIGKILL'));
  }
  if (tmux !== undefined) {
    await command(tmux, ['-S', tmuxSocket, 'kill-server']).catch(() => undefined);
  }
  await fs.rm(temporary, { recursive: true, force: true });
}

function launchXterm() {
  const probe = [
    process.execPath,
    path.join(root, 'tests', 'emulator', 'graphics-probe.mjs'),
    reportPath,
    'sixel',
    `--checkpoint=${checkpointPath}`,
    '--hold',
  ];
  const childCommand = tmux === undefined
    ? probe
    : [
        tmux,
        '-S', tmuxSocket,
        '-f', tmuxConfig,
        'new-session',
        '-s', 'terminal-ui-conformance',
        ...probe,
      ];
  const child = spawn(xterm, [
    '-class', 'terminal-ui-sixel-conformance',
    '-title', 'terminal-ui-sixel-conformance',
    '-geometry', '80x24',
    '-fa', 'DejaVu Sans Mono',
    '-fs', '12',
    '-bg', 'black',
    '-fg', 'white',
    '-xrm', '*decTerminalID: 340',
    '-xrm', '*cursorBlink: false',
    '-hold',
    '-e',
    ...childCommand,
  ], {
    cwd: root,
    env: cleanEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => processLog.push(`stdout: ${chunk}`));
  child.stderr.on('data', (chunk) => processLog.push(`stderr: ${chunk}`));
  child.once('error', (cause) => processLog.push(`launch error: ${String(cause)}\n`));
  return child;
}

async function waitForXtermWindow() {
  return await waitUntil(async () => {
    const tree = await command(xwininfo, ['-root', '-tree']);
    const line = tree.split('\n').find((candidate) => candidate.includes('"terminal-ui-sixel-conformance":'));
    return /^\s*(0x[0-9a-f]+)\s/iu.exec(line ?? '')?.[1];
  }, 'xterm X11 window');
}

async function checkpoint() {
  return JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
}

async function waitForCheckpoint(predicate, label) {
  await waitUntil(async () => predicate(await checkpoint()), label);
}

async function screenshot(windowId, target) {
  await command(imageMagick.import.executable, [...imageMagick.import.arguments, '-window', windowId, target]);
}

async function colorPixelsAfterScreenshot(windowId, name) {
  const target = path.join(artifacts, name);
  await screenshot(windowId, target);
  return await colorPixels(target);
}

async function colorPixels(imagePath, bounds) {
  const [width, height] = (await command(imageMagick.identify.executable, [
    ...imageMagick.identify.arguments,
    '-format', '%w %h',
    imagePath,
  ])).trim().split(' ').map(Number);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid screenshot dimensions for ${imagePath}.`);
  }
  const pixels = await commandBuffer(imageMagick.convert.executable, [
    ...imageMagick.convert.arguments,
    imagePath,
    '-alpha', 'off',
    '-depth', '8',
    'rgb:-',
  ]);
  assert.equal(pixels.byteLength, width * height * 3);
  return {
    width,
    height,
    ...measureGraphicsProbe(pixels, width, height, bounds),
  };
}

function assertGraphicGeometry(pixels, cellPixels, columns, rows) {
  assert.ok(pixels.probe.count > 0);
  const renderedWidth = pixels.probe.maxX - pixels.probe.minX + 1;
  const renderedHeight = pixels.probe.maxY - pixels.probe.minY + 1;
  assert.ok(Math.abs(renderedWidth - cellPixels.width * columns) <= 2, `Graphic width ${String(renderedWidth)} did not match ${String(columns)} cells.`);
  assert.ok(Math.abs(renderedHeight - cellPixels.height * rows) <= 2, `Graphic height ${String(renderedHeight)} did not match ${String(rows)} cells.`);
}

function assertGraphicAboveScrollBoundary(pixels, cellPixels, rows) {
  const verticalBorder = Math.max(0, Math.floor((pixels.height - rows * cellPixels.height) / 2));
  const expectedBottom = verticalBorder + (rows - 1) * cellPixels.height - 1;
  assert.ok(
    Math.abs(pixels.probe.maxY - expectedBottom) <= 3,
    `SIXEL graphic ended at pixel ${String(pixels.probe.maxY)} instead of the safe scroll boundary ${String(expectedBottom)}.`,
  );
}

function assertProbeReport(report) {
  assert.equal(report.status, 'completed');
  assert.equal(report.reason, 'emulator-conformance-complete');
  assert.equal(report.state.input.text, 'alpha');
  assert.equal(report.state.graphics.sixelSupport, 'supported');
  assert.equal(report.state.graphics.sixelAvailability, 'available');
  assert.equal(report.state.imageVisible, false);
  assert.deepEqual(report.diagnostics.filter(({ severity }) => severity === 'error' || severity === 'fatal'), []);
}

async function waitUntil(predicate, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure;
  while (Date.now() < deadline) {
    if (emulatorProcess !== undefined && emulatorProcess.exitCode !== null) {
      throw new Error(`xterm exited before ${label}; see ${path.join(artifacts, 'emulator.log')}.`);
    }
    try {
      const result = await predicate();
      if (result) return result;
    } catch (cause) {
      lastFailure = cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}.${lastFailure === undefined ? '' : ` Last failure: ${String(lastFailure)}`}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('xterm did not exit.')), timeoutMs)),
  ]);
}

async function command(executable, arguments_) {
  return (await commandResult(executable, arguments_)).toString('utf8');
}

async function commandBuffer(executable, arguments_) {
  return await commandResult(executable, arguments_);
}

async function commandResult(executable, arguments_) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const errors = [];
    const child = spawn(executable, arguments_, { cwd: root, env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${path.basename(executable)} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}: ${Buffer.concat(errors).toString('utf8')}`));
    });
  });
}

function cleanEnvironment() {
  const inherited = [
    'DBUS_SESSION_BUS_ADDRESS',
    'DISPLAY',
    'FONTCONFIG_FILE',
    'FONTCONFIG_PATH',
    'HOME',
    'LD_LIBRARY_PATH',
    'LIBGL_ALWAYS_SOFTWARE',
    'LOGNAME',
    'PATH',
    'SHELL',
    'TMPDIR',
    'USER',
    'XAUTHORITY',
    'XDG_DATA_DIRS',
    'XDG_RUNTIME_DIR',
  ];
  return Object.fromEntries([
    ...inherited.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]),
    ['LC_ALL', 'C.UTF-8'],
    ['LANG', 'C.UTF-8'],
  ]);
}

async function imageMagickCommands() {
  const magick = await findExecutable('magick', false);
  if (magick !== undefined) {
    return {
      import: { executable: magick, arguments: ['import'] },
      identify: { executable: magick, arguments: ['identify'] },
      convert: { executable: magick, arguments: [] },
    };
  }
  return {
    import: { executable: await findExecutable('import'), arguments: [] },
    identify: { executable: await findExecutable('identify'), arguments: [] },
    convert: { executable: await findExecutable('convert'), arguments: [] },
  };
}

async function findExecutable(name, required = true) {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (directory === '') continue;
    const candidate = path.join(directory, name);
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Search the next PATH entry.
    }
  }
  if (required) throw new Error(`Required executable is not on PATH: ${name}`);
  return undefined;
}

async function assertExecutable(filePath) {
  await fs.access(filePath, fs.constants.X_OK);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function clearPreviousArtifacts() {
  await Promise.all((await fs.readdir(artifacts)).map(async (name) => {
    await fs.rm(path.join(artifacts, name), { recursive: true, force: true });
  }));
}

function requiredEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') throw new Error(`${name} must name a pinned executable.`);
  return value;
}
