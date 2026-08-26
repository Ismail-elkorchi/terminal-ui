import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { textInput } from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { defineTui, runTui, TuiRunError } from '../../dist/tui/index.js';
import { kittyKeyboardProfile } from '../../dist/protocol/index.js';

void test('invalid run configuration is rejected before terminal mutation', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  await assert.rejects(runTui(exitOnSubmitApp('invalid-cleanup-policy'), {
    host,
    lifecycle: { defaultTimeoutMs: Number.NaN }
  }), (error) => error instanceof TuiRunError &&
    error.exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_RUN_FAILED'));
  assert.equal(host.output(), '');
  assert.equal(host.stdin.isRawModeEnabled(), false);
  assert.equal(host.restores().length, 0);
});

void test('managed TUI rejects Kitty profiles that suppress ordinary text', async () => {
  const host = createMemoryTerminalHost();
  await assert.rejects(runTui(exitOnSubmitApp('text-incapable-kitty-profile'), {
    host,
    sessionPolicy: sessionPolicyWithKeyboard(kittyKeyboardProfile(8))
  }), (error) => error instanceof TuiRunError &&
    error.exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_RUN_FAILED'));
  assert.equal(host.output(), '');
});

void test('managed TUI accepts Kitty all-keys profiles with associated text', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  const exit = await runTui(exitOnSubmitApp('text-capable-kitty-profile'), {
    host,
    sessionPolicy: sessionPolicyWithKeyboard(kittyKeyboardProfile(24))
  });

  assert.equal(exit.status, 'completed');
});

void test('startup clock failure prevents terminal mutation', async () => {
  const host = createMemoryTerminalHost();
  host.input('\r');
  host.clock.sleep = () => Promise.reject(new Error('cleanup clock failed'));
  const app = exitOnSubmitApp('cleanup-clock-failure', () => new Promise(() => undefined));

  await assert.rejects(runTui(app, {
    host,
    lifecycle: { defaultTimeoutMs: 5 },
  }), (error) => error instanceof TuiRunError &&
    error.exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_CLEANUP_FAILED'));
  const restorations = host.restores();
  assert.equal(restorations.length, 0);
  assert.equal(host.stdin.isRawModeEnabled(), false);
});

void test('intentional finalization timer cancellation is not a clock failure', async () => {
  const host = createMemoryTerminalHost({ isTty: false });
  host.clock.sleep = (_ms, signal) => new Promise<'elapsed' | 'aborted'>((resolve) => {
    const abort = (): void => {
      resolve('aborted');
    };
    if (signal?.aborted === true) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  const app = defineTui({
    id: 'abort-rejecting-finalization-clock',
    init: () => ({ state: ({ ready: true }) }),
    update: (state) => ({ state }),
    view: () => textInput({ meta: { accessibleName: "Text input" },
      id: 'abort-rejecting-clock-output',
      state: { value: 'ready', cursor: 0 },
      onTransition: () => ({})
    }),
    nonTty: { mode: 'last_frame' }
  });

  const exit = await runTui(app, { host, lifecycle: { defaultTimeoutMs: 5 } });

  assert.equal(exit.status, 'completed');
  assert.equal(exit.diagnostics.some((item) => item.diagnostic.code === 'TUI_CLEANUP_FAILED'), false);
});

function exitOnSubmitApp(id: string, onExit?: () => void | Promise<void>) {
  return defineTui<{ readonly done: boolean }, { readonly kind: 'exit' }>({
    id,
    init: () => ({ state: ({ done: false }) }),
    update: () => ({ state: { done: true }, exit: {} }),
    view: () => textInput({ meta: { accessibleName: "Text input" },
      id: `${id}-input`,
      state: { value: '', cursor: 0 },
      onTransition: () => ignoreMessage(),
      onSubmit: () => ({ kind: 'exit' as const }),
    }),
    ...(onExit === undefined ? {} : { onExit }),
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
    cursorVisibility: { visibility: 'unchanged' as const, requirement: 'disabled' as const },
    mouseReporting: { mode: 'none' as const, requirement: 'disabled' as const }
  };
}
