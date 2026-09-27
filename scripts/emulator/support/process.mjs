import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

export function execute(executable, arguments_, { cwd, env, inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const errors = [];
    const child = spawn(executable, arguments_, { cwd, env, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    child.stderr?.on('data', (chunk) => errors.push(chunk));
    child.once('error', reject);
    // close waits for output streams to drain, including after an exit event.
    child.once('close', (code, signal) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${path.basename(executable)} failed with ${signal === null ? `exit ${String(code)}` : `signal ${signal}`}: ${Buffer.concat(errors).toString('utf8')}`));
    });
  });
}

export function run(executable, arguments_, cwd = process.cwd()) {
  return execute(executable, arguments_, { cwd, inherit: true });
}

export function createCommands(cwd, environment) {
  const commandBuffer = (executable, arguments_) => execute(executable, arguments_, { cwd, env: environment() });
  return {
    commandBuffer,
    command: async (executable, arguments_) => (await commandBuffer(executable, arguments_)).toString('utf8'),
  };
}

export function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.removeListener('exit', exited); };
    const exited = () => { cleanup(); resolve(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Emulator did not exit.')); }, timeoutMs);
    child.once('exit', exited);
  });
}

export function createWaitUntil({ timeoutMs: defaultTimeout, assertRunning }) {
  return async (predicate, label, timeoutMs = defaultTimeout) => {
    const deadline = Date.now() + timeoutMs;
    let lastFailure;
    while (Date.now() < deadline) {
      await assertRunning(label);
      try {
        const result = await predicate();
        if (result) return result;
      } catch (cause) { lastFailure = cause; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${label}.${lastFailure === undefined ? '' : ` Last failure: ${String(lastFailure)}`}`);
  };
}
