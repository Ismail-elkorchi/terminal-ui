import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/index.ts';
import { defineTui } from './definition.ts';
import { normalizeTuiRunOptions } from './run-configuration.ts';
import { TuiRunLifecycleOwner } from './run-lifecycle.ts';

void test('owned host recovery bypasses a hung restore before host disposal', async () => {
  const app = defineTui({
    id: 'owned-host-emergency-recovery',
    init: () => ({ ready: true }),
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
    normalizeTuiRunOptions({ lifecycle: { defaultTimeoutMs: 5 } }),
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
