import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const kitty = path.resolve(requiredEnvironmentPath('TERMINAL_UI_KITTY'));
const kitten = path.resolve(process.env.TERMINAL_UI_KITTEN ?? path.join(path.dirname(kitty), 'kitten'));
const artifacts = path.resolve(process.env.TERMINAL_UI_EMULATOR_ARTIFACTS ?? path.join(root, '.artifacts', 'emulator', 'kitty'));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-ui-kitty-'));
const socket = path.join(temporary, 'remote-control');
const reportPath = path.join(temporary, 'report.json');
const visibleScreenshot = path.join(artifacts, 'graphics-visible.png');
const hiddenScreenshot = path.join(artifacts, 'graphics-hidden.png');
const processLog = [];
let kittyProcess;

await fs.mkdir(artifacts, { recursive: true });
await clearPreviousArtifacts();
await assertExecutable(kitty);
await assertExecutable(kitten);
const xwininfo = await findExecutable('xwininfo');
const imageMagick = await imageMagickCommands();
const kittyIdentity = (await command(kitty, ['--version'])).trim();
assert.match(kittyIdentity, /^kitty 0\.48\.2\b/u);

try {
  kittyProcess = launchKitty();
  await waitUntil(async () => await exists(socket), 'Kitty remote-control socket');
  await waitForScreen('TERMINAL_UI_EMULATOR_READY');

  const initialScreen = await screenText();
  assert.match(initialScreen, /GRAPHICS kitty=supported transport=direct/u);
  await saveScreen('initial', initialScreen);

  await remote(['send-text', '--match', 'id:-1', '--bracketed-paste', 'disable', 'alpha']);
  await waitForScreen('alpha');
  const pastePath = path.join(temporary, 'paste.txt');
  await fs.writeFile(pastePath, '-paste', { mode: 0o600 });
  await remote(['send-text', '--match', 'id:-1', '--bracketed-paste', 'enable', '--from-file', pastePath]);
  await waitForScreen('alpha-paste');

  await remote(['send-key', '--match', 'id:-1', 'f2']);
  await waitForScreen('KEY press=1 release=1');

  const pointerResult = await remote([
    'kitten',
    '--match',
    'id:-1',
    path.join(root, 'tests', 'emulator', 'kitty-pointer.py'),
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

  const windowId = await kittyXWindowId();
  await screenshot(windowId, visibleScreenshot);
  const visiblePixels = await colorPixels(visibleScreenshot);
  assert.ok(visiblePixels.red.count > 100, 'Kitty did not render the red image region.');
  assert.ok(visiblePixels.green.count > 100, 'Kitty did not render the green image region.');
  assert.equal(visiblePixels.lightInsideGraphic, 0, 'Terminal cells were painted over the Kitty image.');

  await remote(['send-key', '--match', 'id:-1', 'f4']);
  await waitForScreen('IMAGE removed');
  await screenshot(windowId, hiddenScreenshot);
  const hiddenPixels = await colorPixels(hiddenScreenshot);
  assert.ok(hiddenPixels.red.count < 10, 'Kitty retained red graphics pixels after image removal.');
  assert.ok(hiddenPixels.green.count < 10, 'Kitty retained green graphics pixels after image removal.');
  assert.ok(hiddenPixels.graphic.count < 10, 'Kitty retained saturated graphics pixels after image removal.');

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
    displayServer: 'x11',
    display: process.env.DISPLAY,
    softwareRendering: process.env.LIBGL_ALWAYS_SOFTWARE === '1',
    transport: 'direct',
    visiblePixels,
    hiddenPixels,
  }, undefined, 2)}\n`);
  console.log('Kitty emulator conformance passed.');
} catch (cause) {
  await saveScreen('failure', await screenText().catch(() => 'Kitty screen unavailable.\n'));
  throw cause;
} finally {
  await fs.writeFile(path.join(artifacts, 'kitty.log'), processLog.join(''));
  if (kittyProcess !== undefined && kittyProcess.exitCode === null) {
    await remote(['close-window', '--match', 'id:-1']).catch(() => undefined);
    await waitForExit(kittyProcess, 2_000).catch(() => kittyProcess.kill('SIGKILL'));
  }
  await fs.rm(temporary, { recursive: true, force: true });
}

function launchKitty() {
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
    process.execPath,
    path.join(root, 'tests', 'emulator', 'kitty-probe.mjs'),
    reportPath,
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

async function colorPixels(imagePath) {
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
  const graphic = matchingPixels(
    pixels,
    width,
    (red, green, blue) => blue < 40 && Math.max(red, green) > 120 && Math.abs(red - green) > 10,
  );
  return {
    width,
    height,
    red: matchingPixels(pixels, width, (red, green, blue) => red > 180 && green < 80 && blue < 80),
    green: matchingPixels(pixels, width, (red, green, blue) => green > 180 && red < 80 && blue < 80),
    graphic,
    lightInsideGraphic: matchingPixelsInBounds(
      pixels,
      width,
      graphic,
      (red, green, blue) => red > 160 && green > 160 && blue > 160,
    ),
  };
}

function matchingPixels(pixels, width, matches) {
  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (!matches(pixels[offset], pixels[offset + 1], pixels[offset + 2])) continue;
    const pixel = offset / 3;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return count === 0 ? { count } : { count, minX, minY, maxX, maxY };
}

function matchingPixelsInBounds(pixels, width, bounds, matches) {
  if (bounds.count === 0) return 0;
  let count = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const offset = (y * width + x) * 3;
      if (matches(pixels[offset], pixels[offset + 1], pixels[offset + 2])) count += 1;
    }
  }
  return count;
}

function assertGraphicGeometry(pixels, cellPixels) {
  assert.equal(typeof cellPixels, 'object', 'Kitty did not report terminal cell pixel geometry.');
  assert.ok(pixels.graphic.count > 0);
  const renderedWidth = pixels.graphic.maxX - pixels.graphic.minX + 1;
  const renderedHeight = pixels.graphic.maxY - pixels.graphic.minY + 1;
  assert.ok(Math.abs(renderedWidth - cellPixels.width * 12) <= 2, `Graphic width ${String(renderedWidth)} did not match 12 cells.`);
  assert.ok(Math.abs(renderedHeight - cellPixels.height * 6) <= 2, `Graphic height ${String(renderedHeight)} did not match 6 cells.`);
}

function assertProbeReport(report) {
  assert.equal(report.status, 'completed');
  assert.equal(report.reason, 'emulator-conformance-complete');
  assert.equal(report.state.input.text, 'alpha-paste');
  assert.equal(report.state.keyPresses, 1);
  assert.equal(report.state.keyReleases, 1);
  assert.deepEqual(report.state.pointerActivations, { left: 1, middle: 1, right: 1 });
  assert.deepEqual(report.state.terminalSize, { columns: 80, rows: 24 });
  assert.equal(report.state.graphics.kittySupport, 'supported');
  assert.equal(report.state.graphics.kittyAvailability, 'available');
  assert.equal(report.state.graphics.kittyTransport, 'direct');
  assert.equal(report.state.imageVisible, false);
  assert.deepEqual(report.diagnostics.filter(({ severity }) => severity === 'error' || severity === 'fatal'), []);
}

async function waitUntil(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure;
  while (Date.now() < deadline) {
    if (kittyProcess !== undefined && kittyProcess.exitCode !== null) {
      throw new Error(`Kitty exited before ${label}; see ${path.join(artifacts, 'kitty.log')}.`);
    }
    try {
      if (await predicate()) return;
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
    new Promise((_, reject) => setTimeout(() => reject(new Error('Kitty did not exit.')), timeoutMs)),
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

async function saveScreen(name, content) {
  await fs.writeFile(path.join(artifacts, `${name}-screen.txt`), content);
}

async function clearPreviousArtifacts() {
  const names = [
    'failure-screen.txt',
    'evidence.json',
    'graphics-hidden.png',
    'graphics-visible.png',
    'initial-screen.txt',
    'kitty.log',
    'report.json',
    'restored-screen.txt',
  ];
  await Promise.all(names.map(async (name) => fs.unlink(path.join(artifacts, name)).catch(() => undefined)));
}

function requiredEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') throw new Error(`${name} must name the pinned Kitty executable.`);
  return value;
}
