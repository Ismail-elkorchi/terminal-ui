import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { textInput } from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { defineTui, runTui } from '../../dist/tui/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';

void test('invalid run configuration is rejected before terminal mutation', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  const exit = await runTui(exitOnSubmitApp('invalid-cleanup-policy'), host, {
    lifecycle: { defaultTimeoutMs: Number.NaN }
  });

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_RUN_FAILED'), true);
  assert.equal(host.output(), '');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().length, 0);
});

void test('managed TUI rejects Kitty profiles that suppress ordinary text', async () => {
  const host = createMemoryTerminalHost();
  const exit = await runTui(exitOnSubmitApp('text-incapable-kitty-profile'), host, {
    sessionPolicy: sessionPolicyWithKeyboard(kittyKeyboardProfile(8))
  });

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_RUN_FAILED'), true);
  assert.equal(host.output(), '');
});

void test('managed TUI accepts Kitty all-keys profiles with associated text', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  const exit = await runTui(exitOnSubmitApp('text-capable-kitty-profile'), host, {
    sessionPolicy: sessionPolicyWithKeyboard(kittyKeyboardProfile(24))
  });

  assert.equal(exit.status, 'completed');
});

void test('startup clock failure prevents terminal mutation', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  host.clock.sleep = () => Promise.reject(new Error('cleanup clock failed'));
  const app = defineTui({
    ...exitOnSubmitApp('cleanup-clock-failure').definition,
    onExit: () => new Promise(() => undefined)
  });

  const exit = await runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });

  assert.equal(exit.status, 'error');
  assert.equal(exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_CLEANUP_FAILED'), true);
  const restorations = host.restores();
  assert.equal(restorations.length, 0);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

void test('intentional finalization timer cancellation is not a clock failure', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  host.clock.sleep = (_ms, signal) => new Promise<void>((_resolve, reject) => {
    const abort = (): void => {
      reject(new Error('timer cancelled', { cause: signal?.reason }));
    };
    if (signal?.aborted === true) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  const app = defineTui({
    id: 'abort-rejecting-finalization-clock',
    init: () => ({ ready: true }),
    update: (state) => ({ state }),
    view: () => textInput({
      id: 'abort-rejecting-clock-output',
      presentation: { value: 'ready', cursor: 0 },
      onAction: () => ({})
    }),
    nonTty: { mode: 'last_frame' }
  });

  const exit = await runTui(app, host, { lifecycle: { defaultTimeoutMs: 5 } });

  assert.equal(exit.status, 'completed');
  assert.equal(exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_CLEANUP_FAILED'), false);
});

function exitOnSubmitApp(id: string) {
  return defineTui<{ readonly done: boolean }, { readonly kind: 'exit' }>({
    id,
    init: () => ({ done: false }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({
      id: `${id}-input`,
      presentation: { value: '', cursor: 0 },
      onAction: (action) => action.kind === 'submit'
        ? { kind: 'exit' as const }
        : ignoreMessage()
    })
  });
}

function sessionPolicyWithKeyboard(profile: ReturnType<typeof kittyKeyboardProfile>) {
  return {
    alternateScreen: 'disabled' as const,
    rawInput: 'disabled' as const,
    bracketedPaste: 'disabled' as const,
    focusReporting: 'disabled' as const,
    unicodeGraphemeMode: 'disabled' as const,
    keyboard: { profile, requirement: 'disabled' as const },
    cursorVisibility: { state: 'unchanged' as const, requirement: 'disabled' as const },
    mouseReporting: { mode: 'none' as const, requirement: 'disabled' as const }
  };
}
