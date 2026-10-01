import { createCommands, createWaitUntil, waitForExit } from './support/process.mjs';
import { cleanEnvironment } from './support/environment.mjs';
import { assertExecutable, clearArtifacts, exists, findExecutable, requiredEnvironmentPath } from './support/files.mjs';
import { imageMagickCommands } from './support/images.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  countPixelsInBounds,
  isGraphicsProbeCleared,
  measureGraphicsProbe,
} from './support/pixels.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const environment = () => cleanEnvironment();
const { command, commandBuffer } = createCommands(root, environment);
const waitUntil = createWaitUntil({
  timeoutMs: 15_000,
  assertRunning(label) {
    if (kittyProcess !== undefined && (kittyProcess.exitCode !== null || kittyProcess.signalCode !== null)) throw new Error(`Kitty exited before ${label}; see ${path.join(artifacts, 'kitty.log')}.`);
  },
});

const kitty = path.resolve(requiredEnvironmentPath('TERMINAL_UI_KITTY'));
const kitten = path.resolve(process.env.TERMINAL_UI_KITTEN ?? path.join(path.dirname(kitty), 'kitten'));
const tmuxMode = process.argv.includes('--tmux');
const tmux = tmuxMode ? path.resolve(requiredEnvironmentPath('TERMINAL_UI_TMUX')) : undefined;
const evidenceName = tmuxMode ? 'kitty-tmux' : 'kitty-direct';
const artifacts = path.resolve(process.env.TERMINAL_UI_EMULATOR_ARTIFACTS ?? path.join(root, '.artifacts', 'emulator', evidenceName));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-kitty-'));
const socket = path.join(temporary, 'remote-control');
const tmuxSocket = path.join(temporary, 'tmux.sock');
const tmuxConfig = path.join(temporary, 'tmux.conf');
const reportPath = path.join(temporary, 'report.json');
const bootstrapMarker = 'TERMINAL_UI_EMULATOR_BOOTSTRAP';
const bootstrapScreenshot = path.join(artifacts, 'bootstrap-screen.png');
const visibleScreenshot = path.join(artifacts, 'graphics-visible.png');
const hiddenScreenshot = path.join(artifacts, 'graphics-hidden.png');
const processLog = [];
let kittyProcess;

await fs.mkdir(artifacts, { recursive: true });
await clearArtifacts(artifacts, [
    'bootstrap-screen.png',
    'bootstrap-screen.txt',
    'failure-screen.txt',
    'evidence.json',
    'graphics-hidden.png',
    'graphics-refreshed.png',
    'graphics-visible.png',
    'initial-screen.txt',
    'kitty.log',
    'report.json',
    'restored-screen.txt',
  ]);
await assertExecutable(kitty);
await assertExecutable(kitten);
if (tmux !== undefined) await assertExecutable(tmux);
const xwininfo = await findExecutable('xwininfo');
const imageMagick = await imageMagickCommands();
const kittyIdentity = (await command(kitty, ['--version'])).trim();
assert.match(kittyIdentity, /^kitty 0\.48\.2\b/u);
const tmuxIdentity = tmux === undefined ? undefined : (await command(tmux, ['-V'])).trim();
if (tmuxIdentity !== undefined) assert.equal(tmuxIdentity, 'tmux 3.7c');

try {
  if (tmux !== undefined) {
    await fs.writeFile(tmuxConfig, [
      'set -g status off',
      'set -g allow-passthrough on',
      'set -g default-terminal tmux-256color',
      "set -as terminal-features ',xterm-kitty:RGB'",
      '',
    ].join('\n'), { mode: 0o600 });
  }
  kittyProcess = launchKitty();
  await waitUntil(async () => await exists(socket), 'Kitty remote-control socket');
  await waitForScreen(bootstrapMarker);
  const windowId = await waitUntil(kittyXWindowId, 'Kitty X11 window');
  // Remote-control availability precedes the first display frame. Do not begin
  // bounded terminal capability queries until the bootstrap is actually painted.
  await waitUntil(async () => {
    const pixels = await colorPixelsAfterScreenshot(windowId, bootstrapScreenshot);
    return pixels.green.count > 100;
  }, 'painted Kitty bootstrap');
  await saveScreen('bootstrap', await screenText());
  await remote(['send-key', '--match', 'id:-1', 'enter']);
  await waitForScreen('TERMINAL_UI_EMULATOR_READY');

  const initialScreen = await screenText();
  assert.match(
    initialScreen,
    new RegExp(`GRAPHICS kitty=supported transport=${tmuxMode ? 'tmux-passthrough' : 'direct'}`, 'u'),
  );
  await saveScreen('initial', initialScreen);

  await remote(['send-text', '--match', 'id:-1', '--bracketed-paste', 'disable', 'alpha']);
  await waitForScreen('alpha');
  const pastePath = path.join(temporary, 'paste.txt');
  await fs.writeFile(pastePath, '-paste', { mode: 0o600 });
  await remote(['send-text', '--match', 'id:-1', '--bracketed-paste', 'enable', '--from-file', pastePath]);
  await waitForScreen('alpha-paste');

  await remote(['send-key', '--match', 'id:-1', 'f2']);
  await waitForScreen(`KEY press=1 release=${tmuxMode ? '0' : '1'}`);

  const pointerResult = await remote([
    'kitten',
    '--match',
    'id:-1',
    path.join(root, 'tests', 'emulator', 'emulator-pointer.py'),
  ]);
  assert.match(pointerResult, /sent/u);
  await waitForScreen('MOUSE left=1 right=1 middle=1');

  await remote([
    'resize-os-window',
    '--match',
    'id:-1',
    '--unit',
    'cells',
    '--width',
    '80',
    '--height',
    '24',
  ]);
  await waitForScreen('SIZE 80x24');
  const resizedScreen = await screenText();
  assert.doesNotMatch(resizedScreen, /graphics fallback/u);

  const visiblePixels = await waitUntil(async () => {
    const candidate = await colorPixelsAfterScreenshot(windowId, visibleScreenshot);
    return candidate.red.count > 100 && candidate.green.count > 100 ? candidate : undefined;
  }, 'painted Kitty image');
  assert.ok(visiblePixels.red.count > 100, 'Kitty did not render the red image region.');
  assert.ok(visiblePixels.green.count > 100, 'Kitty did not render the green image region.');
  assert.equal(visiblePixels.lightInsideGraphic, 0, 'Terminal cells were painted over the Kitty image.');

  let refreshedPixels;
  if (tmux !== undefined) {
    await command(tmux, ['-S', tmuxSocket, 'refresh-client', '-S']);
    await command(tmux, [
      '-S', tmuxSocket,
      'new-window', '-d', '-n', 'auxiliary',
      'sh -c "printf TMUX_AUXILIARY; while :; do sleep 60; done"',
    ]);
    await command(tmux, ['-S', tmuxSocket, 'select-window', '-t', ':auxiliary']);
    await waitForScreen('TMUX_AUXILIARY');
    await command(tmux, ['-S', tmuxSocket, 'select-window', '-t', ':0']);
    await waitForScreen('TERMINAL_UI_EMULATOR_READY');
    refreshedPixels = await waitUntil(async () => {
      const candidate = await colorPixelsAfterScreenshot(windowId, path.join(artifacts, 'graphics-refreshed.png'));
      return candidate.red.count > 100 && candidate.green.count > 100 ? candidate : undefined;
    }, 'tmux Kitty placeholder redraw');
    assert.ok(refreshedPixels.red.count > 100, 'tmux did not preserve the red Kitty placeholder region.');
    assert.ok(refreshedPixels.green.count > 100, 'tmux did not preserve the green Kitty placeholder region.');
  }

  await remote(['send-key', '--match', 'id:-1', 'f4']);
  await waitForScreen('IMAGE removed');
  const hiddenPixels = await waitUntil(async () => {
    await screenshot(windowId, hiddenScreenshot);
    const candidate = await colorPixels(hiddenScreenshot, visiblePixels.probe);
    return isGraphicsProbeCleared(visiblePixels, candidate) ? candidate : undefined;
  }, 'Kitty graphics cleanup');

  await remote(['send-key', '--match', 'id:-1', 'f10']);
  await waitUntil(async () => await exists(reportPath), 'probe report');
  await waitForScreen('TERMINAL_UI_RESTORED');
  const restoredScreen = await screenText();
  assert.match(restoredScreen, /TERMINAL_UI_RESTORED/u);
  assert.doesNotMatch(restoredScreen, /TERMINAL_UI_EMULATOR_READY/u);
  await saveScreen('restored', restoredScreen);
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  await fs.writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, undefined, 2)}\n`);
  assertProbeReport(report);
  assertGraphicGeometry(visiblePixels, report.state.graphics.cellPixels);
  await fs.writeFile(path.join(artifacts, 'evidence.json'), `${JSON.stringify({
    emulator: kittyIdentity,
    multiplexer: tmuxIdentity,
    displayServer: 'x11',
    display: process.env.DISPLAY,
    softwareRendering: process.env.LIBGL_ALWAYS_SOFTWARE === '1',
    transport: tmuxMode ? 'tmux-passthrough-with-placeholders' : 'direct',
    visiblePixels,
    refreshedPixels,
    hiddenPixels,
  }, undefined, 2)}\n`);
  console.log(`Kitty ${tmuxMode ? 'through tmux' : 'direct'} emulator conformance passed.`);
} catch (cause) {
  await saveScreen('failure', await screenText().catch(() => 'Kitty screen unavailable.\n'));
  throw cause;
} finally {
  await fs.writeFile(path.join(artifacts, 'kitty.log'), processLog.join(''));
  if (kittyProcess !== undefined && kittyProcess.exitCode === null) {
    await remote(['close-window', '--match', 'id:-1']).catch(() => undefined);
    await waitForExit(kittyProcess, 2_000).catch(() => kittyProcess.kill('SIGKILL'));
  }
  if (tmux !== undefined) {
    await command(tmux, ['-S', tmuxSocket, 'kill-server']).catch(() => undefined);
  }
  await fs.rm(temporary, { recursive: true, force: true });
}

function launchKitty() {
  const probe = [
    process.execPath,
    path.join(root, 'tests', 'emulator', 'graphics-bootstrap.mjs'),
    path.join(root, 'tests', 'emulator', 'graphics-probe.mjs'),
    reportPath,
    'kitty',
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
  const child = spawn(kitty, [
    '--config',
    'NONE',
    '--listen-on',
    `unix:${socket}`,
    '--override',
    'allow_remote_control=socket-only',
    '--override',
    'linux_display_server=x11',
    '--override',
    'confirm_os_window_close=0',
    '--override',
    'shell_integration=disabled',
    '--override',
    'update_check_interval=0',
    '--override',
    'enable_audio_bell=no',
    '--override',
    'visual_bell_duration=0',
    '--override',
    'cursor_blink_interval=0',
    '--override',
    'font_family=DejaVu Sans Mono',
    '--override',
    'font_size=12',
    '--override',
    'disable_ligatures=always',
    '--override',
    'window_padding_width=0',
    '--override',
    'tab_bar_style=hidden',
    '--override',
    'remember_window_size=no',
    '--override',
    'initial_window_width=640',
    '--override',
    'initial_window_height=480',
    '--override',
    'background=#000000',
    '--override',
    'foreground=#ffffff',
    '--class',
    'terminal-ui-conformance',
    '--hold',
    ...childCommand,
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

async function remote(arguments_) {
  return await command(kitten, ['@', '--to', `unix:${socket}`, ...arguments_]);
}

async function screenText() {
  return await remote(['get-text', '--match', 'id:-1', '--extent', 'screen']);
}

async function waitForScreen(expected) {
  await waitUntil(async () => (await screenText()).includes(expected), `screen text ${JSON.stringify(expected)}`);
}

async function kittyXWindowId() {
  const tree = await command(xwininfo, ['-root', '-tree']);
  const line = tree.split('\n').find((candidate) => candidate.includes('("terminal-ui-conformance" "terminal-ui-conformance")'));
  if (line === undefined) throw new Error('Could not find the Kitty conformance X11 window.');
  const match = /^\s*(0x[0-9a-f]+)\s/iu.exec(line);
  if (match?.[1] === undefined) throw new Error('Could not parse the Kitty conformance X11 window id.');
  return match[1];
}

async function screenshot(windowId, target) {
  await command(imageMagick.import.executable, [...imageMagick.import.arguments, '-window', windowId, target]);
}

async function colorPixelsAfterScreenshot(windowId, target) {
  await screenshot(windowId, target);
  return await colorPixels(target);
}

async function colorPixels(imagePath, bounds) {
  const dimensions = (await command(imageMagick.identify.executable, [
    ...imageMagick.identify.arguments,
    '-format',
    '%w %h',
    imagePath,
  ])).trim().split(' ').map(Number);
  const [width, height] = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid screenshot dimensions for ${imagePath}.`);
  }
  const pixels = await commandBuffer(imageMagick.convert.executable, [
    ...imageMagick.convert.arguments,
    imagePath,
    '-alpha',
    'off',
    '-depth',
    '8',
    'rgb:-',
  ]);
  assert.equal(pixels.byteLength, width * height * 3);
  const measured = measureGraphicsProbe(pixels, width, height, bounds);
  return {
    width,
    height,
    ...measured,
    lightInsideGraphic: countPixelsInBounds(
      pixels,
      width,
      height,
      bounds ?? measured.probe,
      (red, green, blue) => red > 160 && green > 160 && blue > 160,
    ),
  };
}

function assertGraphicGeometry(pixels, cellPixels) {
  assert.equal(typeof cellPixels, 'object', 'Kitty did not report terminal cell pixel geometry.');
  assert.ok(pixels.probe.count > 0);
  const renderedWidth = pixels.probe.maxX - pixels.probe.minX + 1;
  const renderedHeight = pixels.probe.maxY - pixels.probe.minY + 1;
  assert.ok(Math.abs(renderedWidth - cellPixels.width * 12) <= 2, `Graphic width ${String(renderedWidth)} did not match 12 cells.`);
  assert.ok(Math.abs(renderedHeight - cellPixels.height * 6) <= 2, `Graphic height ${String(renderedHeight)} did not match 6 cells.`);
}

function assertProbeReport(report) {
  assert.equal(report.status, 'completed');
  assert.equal(report.reason, 'emulator-conformance-complete');
  assert.equal(report.state.input.text, 'alpha-paste');
  assert.equal(report.state.keyPresses, 1);
  assert.equal(report.state.keyReleases, tmuxMode ? 0 : 1);
  assert.deepEqual(report.state.pointerActivations, { left: 1, middle: 1, right: 1 });
  assert.deepEqual(report.state.terminalSize, { columns: 80, rows: 24 });
  assert.equal(report.state.graphics.kittySupport, 'supported');
  assert.equal(report.state.graphics.kittyAvailability, 'available');
  assert.equal(report.state.graphics.kittyTransport, tmuxMode ? 'tmux-passthrough' : 'direct');
  assert.equal(report.state.imageVisible, false);
  assert.deepEqual(report.diagnostics.filter(({ severity }) => severity === 'error' || severity === 'fatal'), []);
}

async function saveScreen(name, content) {
  await fs.writeFile(path.join(artifacts, `${name}-screen.txt`), content);
}
