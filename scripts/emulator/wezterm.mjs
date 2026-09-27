import { createCommands, createWaitUntil, waitForExit } from './support/process.mjs';
import { cleanEnvironment } from './support/environment.mjs';
import { clearArtifacts, exists, findExecutable, requiredEnvironmentPath } from './support/files.mjs';
import { imageMagickCommands } from './support/images.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isGraphicsProbeCleared, measureGraphicsProbe } from './support/pixels.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const environment = () => cleanEnvironment({ WAYLAND_DISPLAY: '' });
const { command, commandBuffer } = createCommands(root, environment);
const waitUntil = createWaitUntil({
  timeoutMs: 20_000,
  async assertRunning(label) {
    if (emulatorProcess !== undefined && (emulatorProcess.exitCode !== null || emulatorProcess.signalCode !== null)) {
      const failure = await exists(reportPath) ? await fs.readFile(reportPath, 'utf8') : 'No probe report was produced.';
      throw new Error(`WezTerm exited before ${label}: ${failure.trim()}`);
    }
  },
});

const wezterm = path.resolve(requiredEnvironmentPath('TERMINAL_UI_WEZTERM'));
const artifacts = path.resolve(
  process.env.TERMINAL_UI_EMULATOR_ARTIFACTS
    ?? path.join(root, '.artifacts', 'emulator', 'sixel-wezterm'),
);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-wezterm-conformance-'));
const configPath = path.join(temporary, 'wezterm.lua');
const reportPath = path.join(temporary, 'report.json');
const checkpointPath = path.join(temporary, 'checkpoint.json');
const visibleScreenshot = path.join(artifacts, 'graphics-visible.png');
const hiddenScreenshot = path.join(artifacts, 'graphics-hidden.png');
const processLog = [];
let emulatorProcess;

await fs.mkdir(artifacts, { recursive: true });
await clearArtifacts(artifacts);
await fs.access(wezterm, fs.constants.X_OK);
const xdotool = await findExecutable('xdotool');
const xwininfo = await findExecutable('xwininfo');
const imageMagick = await imageMagickCommands();
const identity = (await command(wezterm, ['--version'])).trim();
assert.equal(identity, 'wezterm 20240203-110809-5046fc22');

try {
  await fs.writeFile(configPath, weztermConfig(), { mode: 0o600 });
  emulatorProcess = launchWezTerm();
  const windowId = await waitForWindow();
  await waitForCheckpoint((state) => state.graphics.sixelSupport === 'supported', 'SIXEL capability');

  const initial = await checkpoint();
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

  await command(xdotool, ['type', '--window', windowId, '--delay', '1', '!']);
  await waitForCheckpoint((state) => state.imageVisible === false, 'image removal');
  const hiddenPixels = await waitUntil(async () => {
    await screenshot(windowId, hiddenScreenshot);
    const candidate = await colorPixels(hiddenScreenshot, visiblePixels.probe);
    return isGraphicsProbeCleared(visiblePixels, candidate) ? candidate : undefined;
  }, 'SIXEL image cleanup');

  await command(xdotool, ['type', '--window', windowId, '--delay', '1', '~']);
  await waitUntil(async () => await exists(reportPath), 'probe report');
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  assertProbeReport(report);
  await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  await fs.writeFile(path.join(artifacts, 'evidence.json'), `${JSON.stringify({
    emulator: identity,
    displayServer: 'x11',
    display: process.env.DISPLAY,
    softwareRendering: process.env.LIBGL_ALWAYS_SOFTWARE === '1',
    protocol: 'sixel',
    path: 'direct',
    visiblePixels,
    hiddenPixels,
  }, undefined, 2)}\n`);
  console.log('WezTerm direct SIXEL emulator conformance passed.');
} finally {
  if (await exists(checkpointPath)) {
    await fs.copyFile(checkpointPath, path.join(artifacts, 'last-checkpoint.json'));
  }
  await fs.writeFile(path.join(artifacts, 'wezterm.log'), processLog.join(''));
  if (emulatorProcess !== undefined && emulatorProcess.exitCode === null) {
    emulatorProcess.kill('SIGTERM');
    await waitForExit(emulatorProcess, 2_000).catch(() => emulatorProcess.kill('SIGKILL'));
  }
  await fs.rm(temporary, { recursive: true, force: true });
}

function launchWezTerm() {
  const child = spawn(wezterm, [
    '--config-file', configPath,
    'start',
    '--always-new-process',
    '--class', 'terminal-ui-wezterm-conformance',
    '--',
    process.execPath,
    path.join(root, 'tests', 'emulator', 'graphics-probe.mjs'),
    reportPath,
    'sixel',
    `--checkpoint=${checkpointPath}`,
    '--known-alternate-screen',
    '--hold',
  ], {
    cwd: root,
    env: environment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => processLog.push(`stdout: ${chunk}`));
  child.stderr.on('data', (chunk) => processLog.push(`stderr: ${chunk}`));
  child.once('error', (cause) => processLog.push(`launch error: ${String(cause)}\n`));
  return child;
}

function weztermConfig() {
  return [
    "local wezterm = require 'wezterm'",
    'return {',
    "  front_end = 'Software',",
    "  font = wezterm.font('DejaVu Sans Mono'),",
    '  font_size = 12,',
    '  initial_cols = 80,',
    '  initial_rows = 24,',
    '  enable_tab_bar = false,',
    "  window_decorations = 'NONE',",
    '  check_for_updates = false,',
    '  enable_kitty_keyboard = true,',
    "  colors = { foreground = '#ffffff', background = '#000000' },",
    '  window_padding = { left = 0, right = 0, top = 0, bottom = 0 },',
    '}',
    '',
  ].join('\n');
}

async function waitForWindow() {
  return await waitUntil(async () => {
    const tree = await command(xwininfo, ['-root', '-tree']);
    const line = tree.split('\n').find((candidate) => candidate.includes('terminal-ui-wezterm-conformance'));
    return /^\s*(0x[0-9a-f]+)\s/iu.exec(line ?? '')?.[1];
  }, 'WezTerm X11 window');
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
  return { width, height, ...measureGraphicsProbe(pixels, width, height, bounds) };
}

function assertGraphicGeometry(pixels, cellPixels, columns, rows) {
  const renderedWidth = pixels.probe.maxX - pixels.probe.minX + 1;
  const renderedHeight = pixels.probe.maxY - pixels.probe.minY + 1;
  assert.ok(Math.abs(renderedWidth - cellPixels.width * columns) <= 2, `Graphic width ${String(renderedWidth)} did not match ${String(columns)} cells.`);
  assert.ok(Math.abs(renderedHeight - cellPixels.height * rows) <= 2, `Graphic height ${String(renderedHeight)} did not match ${String(rows)} cells.`);
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
