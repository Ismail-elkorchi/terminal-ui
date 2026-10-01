import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createTerminalHost } from '../../dist/host/index.js';
import { runTui, TuiRunError } from '../../dist/tui/index.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const options = parseOptions(process.argv.slice(2));
if (options.has('help')) {
  console.log([
    'Graphics-independent native input/session qualification. Build first.',
    'node scripts/emulator/native.mjs --terminal=NAME --terminal-version=VERSION --transport=direct',
    'Also runs under bun, or deno run --allow-read --allow-env --allow-write --allow-sys --allow-run=git.',
    'Options: --scenario=complete|cancel|output-failure --output-mode=visual|accessible',
    '         --evidence=interactive|automated-pty --output=REPORT.json',
    'Use only synthetic text. See docs/guides/native-terminal-qualification.md.',
  ].join('\n'));
} else {
  await qualify();
}

async function qualify() {
  const terminal = requiredText('terminal');
  const terminalVersion = requiredText('terminal-version');
  const transport = requiredText('transport');
  const scenario = choice('scenario', ['complete', 'cancel', 'output-failure'], 'complete');
  const outputMode = choice('output-mode', ['visual', 'accessible'], 'visual');
  const evidence = choice('evidence', ['interactive', 'automated-pty'], 'interactive');
  const outputPath = path.resolve(options.get('output') ?? '.artifacts/native/evidence.json');
  const source = await sourceEvidence();
  const { createAccessibleTaskApp } = await import('../../examples/tui/accessible-task.ts');
  const host = createTerminalHost();
  if (!host.stdin.isTty() || !host.stdout.isTty()) {
    await host.dispose();
    throw new Error('Native qualification requires real TTY input and output. Piped input is not native evidence.');
  }
  const rawBefore = host.stdin.isRawModeEnabled?.();
  const initialSize = host.getTerminalSize();
  const writes = { normal: 0, recovery: 0, bytes: 0 };
  let committedFrames = 0;
  let injectedFailure = false;
  const checkpoints = [];
  let omittedCheckpoints = 0;
  // Observe the real host; do not replace its streams, signals, capabilities or session authority.
  const observer = {
    recordFrame(frame) {
      committedFrames += 1;
      const title = findNode(frame.accessibility.root, 'task-title');
      const checkpoint = {
        frame: committedFrames,
        terminalSize: { columns: frame.width, rows: frame.height },
        focusPath: frame.accessibility.focusPath,
        title: {
          value: String(title?.value ?? '').slice(0, 1_024),
          truncated: String(title?.value ?? '').length > 1_024,
          textPosition: title?.textPosition,
        },
      };
      if (checkpoints.length === 256) { checkpoints.shift(); omittedCheckpoints += 1; }
      checkpoints.push(checkpoint);
      // A small committed-state acknowledgment; no frame cells or application password state.
      writeFileSync(`${outputPath}.checkpoint.tmp`, JSON.stringify(checkpoint), { mode: 0o600 });
      renameSync(`${outputPath}.checkpoint.tmp`, `${outputPath}.checkpoint`);
    },
  };
  const nativeWrite = host.stdout.write.bind(host.stdout);
  host.stdout.write = async (chunk, context) => {
    if (scenario === 'output-failure' && committedFrames > 0 && !injectedFailure) {
      injectedFailure = true;
      throw new Error('Qualification-injected normal output failure after the first committed frame.');
    }
    await nativeWrite(chunk, context);
    writes.normal += 1;
    writes.bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
  };
  const nativeRecoveryWrite = host.stdout.writeRecovery.bind(host.stdout);
  host.stdout.writeRecovery = async (chunk, context) => {
    const receipt = await nativeRecoveryWrite(chunk, context);
    writes.recovery += 1;
    return receipt;
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await fs.rm(`${outputPath}.checkpoint`, { force: true });
  console.log(`Native qualification: ${scenario}, ${outputMode}. Use synthetic text only; Ctrl+Q exits, Ctrl+C cancels.`);
  let exit;
  let disposal;
  try {
    exit = await runTui(createAccessibleTaskApp(), { host: { ...host, observer }, graphics: 'none', outputMode });
  } catch (cause) {
    if (!(cause instanceof TuiRunError)) throw cause;
    exit = cause.exit;
  } finally {
    disposal = await disposeHost(host);
  }
  const steps = exit.transcript?.steps ?? [];
  const inputs = steps.filter((step) => step.kind === 'input').map(({ event }) => event);
  const commits = steps.filter((step) => step.kind === 'commit').map(({ commit }) => ({
    terminalSize: commit.terminalSize,
    focusPath: commit.focusPath,
  }));
  const restores = steps.filter((step) => step.kind === 'restore').map(({ phase, result }) => ({ phase, ...result }));
  const rawAfter = host.stdin.isRawModeEnabled?.();
  const expectedExit = scenario === 'complete'
    ? exit.status === 'completed' && exit.reason === 'quit'
    : scenario === 'cancel'
      ? exit.status === 'cancelled' || exit.status === 'interrupted'
        || exit.status === 'completed' && exit.reason === 'cancelled'
      : exit.status === 'error' && injectedFailure;
  const shutdownRestores = restores.filter(({ phase }) => phase === 'shutdown');
  const restoreSucceeded = shutdownRestores.length > 0
    && shutdownRestores.every(({ status }) => status === 'restored')
    && (rawBefore === undefined || rawAfter === rawBefore);
  const report = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    source,
    evidence,
    operatingSystem: { platform: process.platform, release: os.release(), version: os.version(), architecture: process.arch },
    runtime: { name: host.runtime, version: runtimeVersion(host.runtime), executable: process.execPath },
    terminal: { name: terminal, version: terminalVersion, transport, provenance: 'operator-supplied labels' },
    environment: Object.fromEntries(['TERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'COLORTERM', 'WT_SESSION', 'TMUX']
      .map((name) => [name, name === 'WT_SESSION' || name === 'TMUX' ? process.env[name] !== undefined : process.env[name]])),
    scenario,
    outputMode,
    graphics: 'none',
    status: exit.status,
    reason: exit.reason,
    checks: { expectedExit, restoreSucceeded, hostDisposed: disposal.status === 'disposed' },
    observed: {
      initialSize,
      finalSize: host.getTerminalSize(),
      rawBefore: rawBefore ?? 'unavailable',
      rawAfter: rawAfter ?? 'unavailable',
      committedFrames,
      writes,
      inputs,
      commits,
      checkpoints,
      omittedCheckpoints,
      restores,
      snapshot: exit.snapshot,
      transcriptOmittedSteps: exit.transcript?.omittedSteps,
      disposal,
    },
    failureInjection: scenario === 'output-failure'
      ? { occurred: injectedFailure, boundary: 'host.stdout.write after first frame; native recovery writer retained' }
      : undefined,
    diagnostics: exit.diagnostics.map(({ diagnostic }) => ({
      code: diagnostic.code, severity: diagnostic.severity, message: diagnostic.message,
    })),
    limitations: [
      'A passed exit/restoration check is not complete terminal or accessibility qualification.',
      'Terminal labels are supplied by the operator. No emulator identity is inferred from TERM.',
      'Mode restoration with sent assurance proves transport output, not visual terminal state.',
      'Injected output failure is not a broken native file descriptor or terminal disconnect.',
      'IME composition, dead keys, hardware key delivery, screen-reader speech and visual restoration require separate direct observation.',
      ...(evidence === 'automated-pty' ? ['Synthetic Unix PTY bytes and resize signals do not qualify a terminal emulator, macOS Terminal, Windows ConPTY, or a screen reader.'] : []),
    ],
  };
  await fs.writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`, { mode: 0o600 });
  await fs.rm(`${outputPath}.checkpoint`, { force: true });
  console.log(`Native evidence written to ${outputPath}`);
  if (!expectedExit || !restoreSucceeded || disposal.status !== 'disposed') process.exitCode = 1;
}

async function disposeHost(host) {
  const controller = new globalThis.AbortController();
  let timeout;
  const disposed = Promise.resolve().then(() => host.dispose({ signal: controller.signal })).then(
    () => ({ status: 'disposed' }),
    (cause) => ({ status: 'failed', message: cause instanceof Error ? cause.message : String(cause) }),
  );
  try {
    return await Promise.race([
      disposed,
      new Promise((resolve) => {
        timeout = setTimeout(() => {
          controller.abort('native_qualification_disposal_timeout');
          resolve({ status: 'timed_out', timeoutMs: 1_000 });
        }, 1_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseOptions(arguments_) {
  const allowed = new Set(['terminal', 'terminal-version', 'transport', 'scenario', 'output-mode', 'evidence', 'output']);
  const parsed = new Map();
  for (const argument of arguments_) {
    if (argument === '--help' && arguments_.length === 1) return new Map([['help', 'true']]);
    const match = /^--([^=]+)=(.+)$/u.exec(argument);
    if (!match || !allowed.has(match[1]) || parsed.has(match[1])) {
      throw new Error('Native qualification options must be supported, unique --name=value arguments. Use --help.');
    }
    parsed.set(match[1], match[2]);
  }
  return parsed;
}

function requiredText(name) {
  const value = options.get(name);
  if (value === undefined || value.trim() === '') throw new Error(`--${name} is required.`);
  return value;
}

function choice(name, choices, fallback) {
  const value = options.get(name) ?? fallback;
  if (!choices.includes(value)) throw new Error(`--${name} must be one of: ${choices.join(', ')}.`);
  return value;
}

function runtimeVersion(runtime) {
  if (runtime === 'deno') return globalThis.Deno.version.deno;
  if (runtime === 'bun') return globalThis.Bun.version;
  return process.versions.node;
}

async function sourceEvidence() {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const status = git(['status', '--short']);
  const builtFiles = (await fs.readdir(path.join(root, 'dist'), { recursive: true }))
    .filter((file) => file.endsWith('.js')).sort();
  const built = createHash('sha256');
  for (const file of builtFiles) {
    built.update(file.replaceAll(path.sep, '/'));
    built.update('\0');
    built.update(await fs.readFile(path.join(root, 'dist', file)));
  }
  const hashFile = async (file) => createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  return {
    commit: git(['rev-parse', 'HEAD']),
    worktreeClean: status === '',
    worktreeStatus: status,
    builtJavaScriptSha256: built.digest('hex'),
    applicationSha256: await hashFile('examples/tui/accessible-task.ts'),
    probeSha256: await hashFile('scripts/emulator/native.mjs'),
  };
}
