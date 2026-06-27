import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnostic } from '../../dist/diagnostics.js';
import { autocomplete, multiselect, runPrompt, select } from '../../dist/prompts/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { flushAsync, waitUntil } from '../helpers/async.mjs';

test('runPrompt supports interactive select navigation and disabled choices', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(select({
    label: 'Color',
    choices: [
      { label: 'Red', value: 'red', disabled: 'unavailable' },
      { label: 'Green', value: 'green' },
      { label: 'Blue', value: 'blue' }
    ]
  }), harness.host);

  harness.host.input('\u001B[B');
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'blue');
  assert.equal(result.snapshot.root.role, 'listbox');
  assert.equal(result.snapshot.root.children[0]?.disabled, true);
  assert.equal(result.snapshot.root.children[2]?.selected, true);
  assert.match(harness.output(), /Color:/);
  assert.match(harness.output(), /›   Blue/);
});

test('runPrompt renders choice descriptions and sanitizes prompt output', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(select({
    label: 'Tool\u001B[31m',
    choices: [
      { label: 'Inspect', value: 'inspect', description: 'Review\u001B[33m output' }
    ]
  }), harness.host);

  await waitUntil(() => /Tool:/.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;
  const output = harness.output();

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'inspect');
  assert.match(output, /Inspect - Review output/);
  assert.doesNotMatch(output, /\u001B\[31m|\u001B\[33m/u);
});

test('runPrompt renders empty states for choice prompts', async () => {
  const selectHarness = createTerminalHarness();
  const selectRun = runPrompt(select({ label: 'Pick', choices: [] }), selectHarness.host);

  await waitUntil(() => /No choices/.test(selectHarness.output()));
  selectHarness.host.input('\u001B');
  selectHarness.host.stdin.close();
  await selectRun;

  const multiselectHarness = createTerminalHarness();
  const multiselectRun = runPrompt(multiselect({ label: 'Pick many', choices: [] }), multiselectHarness.host);

  await waitUntil(() => /No choices/.test(multiselectHarness.output()));
  multiselectHarness.host.input('\u001B');
  multiselectHarness.host.stdin.close();
  await multiselectRun;
});

test('runPrompt searches select choices by keyword and description', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(select({
    label: 'Tool',
    choices: [
      { label: 'Paint', value: 'paint' },
      { label: 'Archive', value: 'archive', keywords: ['compress'] },
      { label: 'Inspect', value: 'inspect', description: 'Review terminal output' }
    ]
  }), harness.host);

  harness.host.input('term');
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'inspect');
  assert.equal(result.snapshot.root.children[2]?.selected, true);
});

test('runPrompt supports interactive multiselect toggling and bounds', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(multiselect({
    label: 'Features',
    minSelected: 2,
    choices: [
      { label: 'Search', value: 'search' },
      { label: 'Legacy', value: 'legacy', disabled: true },
      { label: 'Replay', value: 'replay' }
    ]
  }), harness.host);

  harness.host.input(' ');
  harness.host.input('\u001B[B');
  harness.host.input(' ');
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, ['search', 'replay']);
  assert.equal(result.snapshot.root.children[0]?.checked, true);
  assert.equal(result.snapshot.root.children[1]?.disabled, true);
  assert.equal(result.snapshot.root.children[2]?.checked, true);
});

test('runPrompt searches multiselect choices before toggling', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(multiselect({
    label: 'Features',
    choices: [
      { label: 'Search', value: 'search' },
      { label: 'Replay', value: 'replay', keywords: ['history'] },
      { label: 'Render', value: 'render' }
    ]
  }), harness.host);

  harness.host.input('history');
  harness.host.input(' ');
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, ['replay']);
  assert.equal(result.snapshot.root.children[1]?.focused, true);
  assert.equal(result.snapshot.root.children[1]?.checked, true);
});

test('runPrompt supports configured multiselect range selection', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(multiselect({
    label: 'Features',
    rangeSelection: true,
    choices: [
      { label: 'Search', value: 'search' },
      { label: 'Legacy', value: 'legacy', disabled: true },
      { label: 'Replay', value: 'replay' },
      { label: 'Render', value: 'render' }
    ]
  }), harness.host);

  harness.host.input(' ');
  harness.host.input('\u001B[1;2B');
  harness.host.input('\u001B[1;2B');
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, ['search', 'replay', 'render']);
  assert.equal(result.snapshot.root.children[0]?.checked, true);
  assert.equal(result.snapshot.root.children[1]?.disabled, true);
  assert.equal(result.snapshot.root.children[1]?.checked, false);
  assert.equal(result.snapshot.root.children[2]?.checked, true);
  assert.equal(result.snapshot.root.children[3]?.checked, true);
});

test('runPrompt keeps multiselect range selection opt-in', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(multiselect({
    label: 'Features',
    choices: [
      { label: 'Search', value: 'search' },
      { label: 'Replay', value: 'replay' },
      { label: 'Render', value: 'render' }
    ]
  }), harness.host);

  harness.host.input(' ');
  harness.host.input('\u001B[1;2B');
  harness.host.input('\u001B[1;2B');
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.deepEqual(result.value, ['search']);
  assert.equal(result.snapshot.root.children[0]?.checked, true);
  assert.equal(result.snapshot.root.children[2]?.focused, true);
  assert.equal(result.snapshot.root.children[2]?.checked, false);
});

test('runPrompt reports choice data source failures as prompt diagnostics', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(select({
    label: 'Broken',
    choices: async () => {
      throw new Error('source failed');
    }
  }), harness.host);

  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'aborted');
  assert.equal(result.reason, 'host_error');
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_DATA_SOURCE_FAILED');
});

test('runPrompt preserves successful choice data source diagnostics in results and transcripts', async () => {
  const harness = createTerminalHarness();
  const sourceDiagnostic = diagnostic('PROMPT_DATA_SOURCE_FAILED', 'Some choices were omitted.', {
    severity: 'warning',
    data: { source: 'partial' }
  });
  const running = runPrompt(select({
    label: 'Package',
    transcript: { enabled: true },
    choices: async () => ({
      choices: [{ label: 'Core', value: 'core' }],
      diagnostics: [sourceDiagnostic]
    })
  }), harness.host);

  await waitUntil(() => /Some choices were omitted/.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'core');
  assert.deepEqual(result.diagnostics, [sourceDiagnostic]);
  assert.deepEqual(result.transcript?.diagnostics, [sourceDiagnostic]);
  assert.ok(result.transcript?.steps.some((step) => step.kind === 'diagnostic'));
});

test('runPrompt incrementally paginates async select data sources', async () => {
  const harness = createTerminalHarness();
  const requests = [];
  const running = runPrompt(select({
    label: 'Package',
    choices: async ({ query, offset, limit }) => {
      requests.push({ query, offset, limit });
      return offset === 0
        ? { choices: [{ label: 'Core', value: 'core' }], total: 2, hasMore: true }
        : { choices: [{ label: 'Testing', value: 'testing' }], total: 2, hasMore: false };
    }
  }), harness.host);

  await waitUntil(() => /More choices available \(1\/2\)/.test(harness.output()));
  harness.host.input('\u001B[6~');
  await waitUntil(() => /Testing/.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'testing');
  assert.deepEqual(requests, [
    { query: '', offset: 0, limit: 50 },
    { query: '', offset: 1, limit: 50 }
  ]);
});

test('runPrompt supports autocomplete query filtering and submission', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(autocomplete({
    label: 'Command',
    choices: [
      { label: 'Search', value: 'search', keywords: ['find'] },
      { label: 'Replay', value: 'replay' },
      { label: 'Render', value: 'render' }
    ]
  }), harness.host);

  harness.host.input('re');
  await waitUntil(() => /Replay/.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'replay');
  assert.equal(result.snapshot.root.value, 'Replay');
  assert.equal(result.snapshot.root.children[0]?.label, 'Replay');
});

test('runPrompt highlights autocomplete label matches without mutating submitted state', async () => {
  const harness = createTerminalHarness();
  const running = runPrompt(autocomplete({
    label: 'Command',
    choices: [
      { label: 'Re\u001B[31mplay', value: 'replay' },
      { label: 'Search', value: 'search', description: 'Find recently used entries' }
    ]
  }), harness.host);

  harness.host.input('re');
  await waitUntil(() => /\u001B\[4;38;5;13mReplay/u.test(harness.output()));
  assert.doesNotMatch(harness.output(), /\u001B\[31m/u);
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'replay');
  assert.equal(result.snapshot.root.children[0]?.label, 'Replay');
});

test('runPrompt debounces autocomplete data source refreshes', async () => {
  const harness = createTerminalHarness();
  const requests = [];
  const running = runPrompt(autocomplete({
    label: 'Package',
    debounceMs: 50,
    choices: async ({ query, offset, limit }) => {
      requests.push({ query, offset, limit });
      return {
        choices: [{ label: query.length === 0 ? 'Initial' : `Result ${query}`, value: query }]
      };
    }
  }), harness.host);

  await waitUntil(() => /Initial/.test(harness.output()));
  requests.length = 0;
  harness.host.input('a');
  await waitUntil(() => /Package: a/.test(harness.output()));
  harness.host.input('b');
  await waitUntil(() => /Package: ab/.test(harness.output()));

  await flushAsync();
  assert.deepEqual(requests, []);
  harness.clock.advance(49);
  await flushAsync();
  assert.deepEqual(requests, []);
  harness.clock.advance(1);
  await waitUntil(() => requests.length === 1);
  await waitUntil(() => /Result ab/.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'ab');
  assert.deepEqual(requests, [{ query: 'ab', offset: 0, limit: 50 }]);
});

test('runPrompt suppresses stale autocomplete data source results', async () => {
  const harness = createTerminalHarness();
  const requests = [];
  const running = runPrompt(autocomplete({
    label: 'Command',
    choices: ({ query, signal }) => new Promise((resolve, reject) => {
      const request = { query, resolve };
      requests.push(request);
      signal.addEventListener('abort', () => reject(new Error(`aborted ${query}`)), { once: true });
    })
  }), harness.host);

  await waitUntil(() => requests.length === 1);
  requests[0].resolve({ choices: [{ label: 'All', value: 'all' }] });
  await waitUntil(() => /All/.test(harness.output()));

  harness.host.input('a');
  await waitUntil(() => requests.some((request) => request.query === 'a'));
  harness.host.input('b');
  await waitUntil(() => requests.some((request) => request.query === 'ab'));

  const aRequest = requests.find((request) => request.query === 'a');
  const abRequest = requests.find((request) => request.query === 'ab');
  aRequest.resolve({ choices: [{ label: 'Alpha', value: 'alpha' }] });
  abRequest.resolve({ choices: [{ label: 'About', value: 'about' }] });
  await waitUntil(() => /About/.test(harness.output()));
  assert.doesNotMatch(harness.output(), /Alpha/);

  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'about');
});

test('runPrompt paginates autocomplete data sources with the current query', async () => {
  const harness = createTerminalHarness();
  const requests = [];
  const running = runPrompt(autocomplete({
    label: 'Command',
    choices: async ({ query, offset, limit }) => {
      requests.push({ query, offset, limit });
      if (query !== 're') return { choices: [], hasMore: false };
      return offset === 0
        ? { choices: [{ label: 'Render', value: 'render' }], total: 2, hasMore: true }
        : { choices: [{ label: 'Replay', value: 'replay' }], total: 2, hasMore: false };
    }
  }), harness.host);

  harness.host.input('re');
  await waitUntil(() => /More choices available \(1\/2\)/.test(harness.output()));
  harness.host.input('\u001B[6~');
  await waitUntil(() => /Replay/.test(harness.output()));
  harness.host.input('\r');
  harness.host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'submitted');
  assert.equal(result.value, 'replay');
  assert.ok(requests.some((request) => request.query === 're' && request.offset === 0 && request.limit === 50));
  assert.ok(requests.some((request) => request.query === 're' && request.offset === 1 && request.limit === 50));
});
