import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/index.ts';
import { defineTui } from './definition.ts';
import { resolveTuiRunOptions } from './run-configuration.ts';
import { TuiRunLifecycleOwner } from './run-lifecycle.ts';
import { isTerminalTheme, resolveThemeColor } from '../theme/index.ts';

void test('TUI run options own partial theme definitions at admission', () => {
  const color = { kind: 'ansi' as const, value: 1 };
  const options = resolveTuiRunOptions({
    theme: { tokens: { colors: { 'text.default': color } } }
  });
  color.value = 2;

  assert.equal(typeof options.theme, 'object');
  if (!isTerminalTheme(options.theme)) {
    throw new Error('Expected a canonical TUI theme.');
  }
  assert.deepEqual(resolveThemeColor(options.theme, 'text.default'), { kind: 'ansi', value: 1 });
});

void test('owned host recovery bypasses a hung restore before host disposal', async () => {
  const app = defineTui({
    id: 'owned-host-emergency-recovery',
    init: () => ({ state: { ready: true } }),
    update: (state) => ({ state }),
    view: () => text({ content: 'ready' })
  });
  const host = createMemoryTerminalHost();
  const dispose = host.dispose.bind(host);
  let disposalCalls = 0;
  host.dispose = async (context) => {
    disposalCalls += 1;
    await dispose(context);
  };
  const lifecycle = new TuiRunLifecycleOwner(
    app,
    host,
    true,
    resolveTuiRunOptions({ lifecycle: { defaultTimeoutMs: 5 } }),
    undefined
  );
  const session = await host.beginSession({ id: app.id });
  lifecycle.openSession(session);
  await session.hideCursor();
  await session.enableRawInput();
  const writeRecovery = host.writeRecovery.bind(host);
  let recoveryWrites = 0;
  host.writeRecovery = (output, context) => {
    recoveryWrites += 1;
    if (recoveryWrites === 1) return new Promise(() => undefined);
    return writeRecovery(output, context);
  };

  const finalizing = lifecycle.finalize('error');
  await waitUntil(() => recoveryWrites === 1);
  host.clock.advance(5);
  await waitUntil(() => recoveryWrites >= 2);
  const finalization = await finalizing;

  assert.equal(finalization.phases.find((phase) => phase.phase === 'restore')?.status, 'timed_out');
  assert.equal(finalization.phases.find((phase) => phase.phase === 'recovery')?.status, 'settled');
  assert.equal(finalization.phases.find((phase) => phase.phase === 'host')?.status, 'settled');
  assert.equal(host.restores().length, 1);
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(disposalCalls, 1);
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  throw new Error('Timed out waiting for lifecycle progress.');
}
