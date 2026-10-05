import assert from 'node:assert/strict';
import test from 'node:test';
import { TerminalInputAuthority } from './input-authority.ts';
import { createTerminalModeResponseProtocol, queriedModes } from './terminal-mode-query.ts';
import type { TerminalModeKey } from './terminal-mode-query.ts';
import type { TerminalClock, TerminalInputChunk } from './types.ts';

void test('mode collection completes a valid mode-8 response without a DA reply', async () => {
  const harness = modeHarness();
  const query = harness.query(['standard:8']);
  harness.push('before\u001B[8;2$yafter');
  assert.deepEqual(await query.result, { status: 'matched', value: { 'standard:8': 'reset' } });
  assert.deepEqual(query.protocol.evidence(), {
    reports: { 'standard:8': 'reset' }, missingModes: [], conflictingModes: [], complete: true,
  });
  assert.equal(await readText(harness.authority, 'beforeafter'.length), 'beforeafter');
  await harness.authority.dispose();
});

void test('mode collection accepts reports after early DA in later input batches', async () => {
  const harness = modeHarness();
  const query = harness.query(['standard:8', 'private:25']);
  let finished = false;
  void query.result.then(() => { finished = true; });
  harness.push('before\u001B[?1;2c\u001B[?25;1$y');
  await flush();
  assert.equal(finished, false);
  harness.push('after\u001B[8;2$y');
  assert.deepEqual(await query.result, {
    status: 'matched', value: { 'private:25': 'set', 'standard:8': 'reset' },
  });
  assert.equal(await readText(harness.authority, 'beforeafter'.length), 'beforeafter');
  await harness.authority.settleResponseQuarantine();
  await harness.authority.dispose();
});

void test('partial reports survive timeout without treating missing modes or DA as evidence', async () => {
  const harness = modeHarness();
  const query = harness.query(['standard:8', 'private:25']);
  harness.push('typed\u001B[8;2$y\u001B[?1;2c');
  await flush();
  query.controller.abort('query timeout');
  assert.deepEqual(await query.result, { status: 'cancelled' });
  assert.deepEqual(query.protocol.evidence(), {
    reports: { 'standard:8': 'reset' }, missingModes: ['private:25'], conflictingModes: [], complete: false,
  });
  assert.equal(await readOne(harness.authority), 'typed');
  await harness.authority.dispose();
});

void test('mode collection frames every split boundary and consumes same-batch duplicates', async () => {
  const reply = '\u001B[8;2$y\u001B[8;2$y\u001B[?1;2c';
  for (let split = 1; split < reply.length; split += 1) {
    const harness = modeHarness();
    const query = harness.query(['standard:8']);
    harness.push(reply.slice(0, split));
    await flush();
    harness.push(reply.slice(split));
    assert.deepEqual(await query.result, { status: 'matched', value: { 'standard:8': 'reset' } });
    await harness.authority.dispose();
  }
  const harness = modeHarness();
  const query = harness.query(['standard:8']);
  harness.push(Uint8Array.from([0x9b, ...new TextEncoder().encode('8;4$y')]));
  assert.deepEqual(await query.result, { status: 'matched', value: { 'standard:8': 'permanently_reset' } });
  await harness.authority.dispose();
});

void test('contradictory same-batch mode reports cannot authorize a completed query', async () => {
  const harness = modeHarness();
  const query = harness.query(['standard:8']);
  harness.push('\u001B[8;2$y\u001B[?1;2c\u001B[8;1$y\u001B[8;2$y');
  assert.deepEqual(await query.result, { status: 'matched', value: {} });
  assert.deepEqual(query.protocol.evidence(), {
    reports: {}, missingModes: [], conflictingModes: ['standard:8'], complete: true,
  });
  await harness.authority.dispose();
});

void test('a split contradictory report already in the collection buffer is completed before admission', async () => {
  const harness = modeHarness();
  const query = harness.query(['standard:8']);
  let finished = false;
  void query.result.then(() => { finished = true; });
  harness.push('\u001B[8;2$y\u001B[8;');
  await flush();
  assert.equal(finished, false);
  harness.push('1$y\u001B[?1;2c');
  assert.deepEqual(await query.result, { status: 'matched', value: {} });
  assert.deepEqual(query.protocol.evidence().conflictingModes, ['standard:8']);
  await harness.authority.dispose();
});

for (const fragmented of [false, true]) {
  void test(`all-mode timeout preserves hard negative mode conflicts with fragmented=${String(fragmented)}`, async () => {
    const harness = modeHarness();
    const query = harness.query(queriedModes);
    const replies = '\u001B[?1049;2$y\u001B[?1049;4$y\u001B[?2026;1$y\u001B[?2026;2$y\u001B[?1;2c';
    if (fragmented) {
      for (const character of replies) {
        harness.push(character);
        await flush();
      }
    } else harness.push(replies);
    await flush();
    query.controller.abort('query timeout');
    assert.deepEqual(await query.result, { status: 'cancelled' });
    const evidence = query.protocol.evidence();
    assert.deepEqual(evidence, {
      reports: {},
      missingModes: queriedModes.filter((mode) => mode !== 'private:1049' && mode !== 'private:2026'),
      conflictingModes: ['private:1049', 'private:2026'],
      complete: false,
    });
    const refreshed = harness.query(queriedModes);
    harness.push('\u001B[?1049;2$y\u001B[?2026;2$y\u001B[?1;2c');
    await flush();
    assert.equal(harness.sends(), 1);
    assert.deepEqual(query.protocol.evidence(), evidence, 'late confirmations cannot erase old conflicts');
    harness.clock.advance(100);
    await flush();
    assert.equal(harness.sends(), 2);
    harness.push('\u001B[?1;2c');
    await flush();
    refreshed.controller.abort('refresh timeout');
    assert.deepEqual(await refreshed.result, { status: 'cancelled' });
    assert.deepEqual(refreshed.protocol.evidence(), {
      reports: {}, missingModes: queriedModes, conflictingModes: [], complete: false,
    });
    assert.deepEqual(query.protocol.evidence(), evidence, 'new observation generations never alter old evidence');
    await harness.authority.dispose();
  });
}

void test('complete all-mode coverage never hides contradictory private-mode reports', async () => {
  const harness = modeHarness();
  const query = harness.query(queriedModes);
  const unconflictedReplies = queriedModes
    .filter((mode) => mode !== 'private:1049' && mode !== 'private:2026')
    .map((mode) => {
      const [namespace, number] = mode.split(':');
      return `\u001B[${namespace === 'private' ? '?' : ''}${number ?? ''};0$y`;
    }).join('');
  harness.push(`${unconflictedReplies}\u001B[?1049;2$y\u001B[?1049;4$y\u001B[?2026;1$y\u001B[?2026;`);
  await flush();
  harness.push('2$y\u001B[?1;2c');
  const result = await query.result;
  assert.equal(result.status, 'matched');
  const evidence = query.protocol.evidence();
  assert.equal(evidence.complete, true);
  assert.deepEqual(evidence.missingModes, []);
  assert.deepEqual(evidence.conflictingModes, ['private:1049', 'private:2026']);
  assert.equal(evidence.reports['private:1049'], undefined);
  assert.equal(evidence.reports['private:2026'], undefined);
  await harness.authority.dispose();
});

void test('retired mode collection consumes late DA and reports for the full quarantine before retry', async () => {
  const harness = modeHarness();
  const first = harness.query(['standard:8']);
  harness.push('\u001B[8;2$y');
  assert.deepEqual(await first.result, { status: 'matched', value: { 'standard:8': 'reset' } });
  const retry = harness.query(['standard:8']);
  await flush();
  assert.equal(harness.sends(), 1);
  harness.push('before\u001B[?1;2c');
  await flush();
  assert.equal(harness.sends(), 1, 'early late DA does not reopen query admission');
  harness.push('\u001B[8;2$yafter');
  await flush();
  assert.equal(harness.sends(), 1, 'late mode responses do not reopen query admission');
  harness.clock.advance(100);
  await flush();
  assert.equal(harness.sends(), 2);
  harness.push('\u001B[8;1$y\u001B[?1;2c');
  assert.deepEqual(await retry.result, { status: 'matched', value: { 'standard:8': 'set' } });
  assert.deepEqual(first.protocol.evidence().reports, { 'standard:8': 'reset' });
  assert.equal(await readText(harness.authority, 'beforeafter'.length), 'beforeafter');
  await harness.authority.dispose();
});

void test('timeout quarantine cannot add late missing reports to the retired evidence snapshot', async () => {
  const harness = modeHarness();
  const first = harness.query(['standard:8', 'private:25']);
  harness.push('\u001B[?25;1$y\u001B[?1;2c');
  await flush();
  first.controller.abort('query timeout');
  assert.deepEqual(await first.result, { status: 'cancelled' });
  const retry = harness.query(['standard:8']);
  harness.push('\u001B[?1;2c\u001B[8;2$y');
  await flush();
  assert.deepEqual(first.protocol.evidence(), {
    reports: { 'private:25': 'set' }, missingModes: ['standard:8'], conflictingModes: [], complete: false,
  });
  assert.equal(harness.sends(), 1);
  harness.clock.advance(100);
  await flush();
  assert.equal(harness.sends(), 2);
  harness.push('\u001B[8;0$y\u001B[?1;2c');
  assert.deepEqual(await retry.result, { status: 'matched', value: { 'standard:8': 'unrecognized' } });
  await harness.authority.dispose();
});

void test('a timed-out split mode response stays quarantined beyond the short ambiguity deadline', async () => {
  const harness = modeHarness();
  const first = harness.query(['standard:8']);
  harness.push('before\u001B[8;');
  await flush();
  first.controller.abort('query timeout');
  assert.deepEqual(await first.result, { status: 'cancelled' });
  const retry = harness.query(['standard:8']);
  harness.clock.advance(25);
  await flush();
  assert.equal(harness.sends(), 1);
  harness.push('2$y\u001B[?1;2cafter');
  await flush();
  assert.deepEqual(first.protocol.evidence().reports, {});
  harness.clock.advance(75);
  await flush();
  assert.equal(harness.sends(), 2);
  harness.push('\u001B[8;1$y\u001B[?1;2c');
  assert.deepEqual(await retry.result, { status: 'matched', value: { 'standard:8': 'set' } });
  assert.equal(await readText(harness.authority, 'beforeafter'.length), 'beforeafter');
  await harness.authority.dispose();
});

void test('expired ambiguous replay cannot combine with a late suffix to authorize a new query', async () => {
  const harness = modeHarness();
  const first = harness.query(['standard:8']);
  harness.push('\u001B[8;');
  await flush();
  first.controller.abort('query timeout');
  await first.result;
  const retry = harness.query(['standard:8']);
  let finished = false;
  void retry.result.then(() => { finished = true; });
  harness.clock.advance(100);
  await flush();
  harness.push('2$y');
  await flush();
  assert.equal(finished, false);
  harness.push('\u001B[8;1$y\u001B[?1;2c');
  assert.deepEqual(await retry.result, { status: 'matched', value: { 'standard:8': 'set' } });
  assert.equal(await readOne(harness.authority), '\u001B[8;');
  assert.equal(await readOne(harness.authority), '2$y');
  await harness.authority.dispose();
});

void test('a quarantine byte-budget overflow cannot release a later mode query early', async () => {
  const harness = modeHarness();
  const first = harness.query(['standard:8']);
  first.controller.abort('query timeout');
  await first.result;
  const retry = harness.query(['standard:8']);
  harness.push(`${'x'.repeat(64 * 1024)}\u001B[8;2$y`);
  await flush();
  assert.equal(harness.sends(), 1);
  harness.clock.advance(100);
  await flush();
  harness.push('\u001B[8;1$y\u001B[?1;2c');
  assert.deepEqual(await retry.result, { status: 'matched', value: { 'standard:8': 'set' } });
  await harness.authority.dispose();
});

void test('caller cancellation and failed sends never become successful query completions', async () => {
  const harness = modeHarness();
  const cancelled = harness.query(['standard:8', 'private:25']);
  harness.push('\u001B[8;2$y');
  await flush();
  cancelled.controller.abort('owner cancelled');
  assert.deepEqual(await cancelled.result, { status: 'cancelled' });
  const snapshot = cancelled.protocol.evidence();
  const failedProtocol = createTerminalModeResponseProtocol(['standard:8']);
  const cause = new Error('query was not committed');
  const failed = harness.authority.queryTerminal({
    signal: new AbortController().signal, clock: harness.clock, protocol: failedProtocol,
    send: () => Promise.reject(cause),
  });
  harness.clock.advance(100);
  await flush();
  assert.deepEqual(await failed, { status: 'failed', cause });
  assert.deepEqual(failedProtocol.evidence().reports, {});
  assert.deepEqual(cancelled.protocol.evidence(), snapshot);
  await harness.authority.dispose();
});

async function readText(authority: TerminalInputAuthority, length: number): Promise<string> {
  let result = '';
  while (result.length < length) result += await readOne(authority);
  return result;
}

async function readOne(authority: TerminalInputAuthority): Promise<string> {
  const reader = authority.read()[Symbol.asyncIterator]();
  const result = await reader.next();
  await reader.return?.();
  assert.equal(result.done, false);
  return typeof result.value.data === 'string' ? result.value.data : new TextDecoder().decode(result.value.data);
}

async function flush(): Promise<void> {
  for (let count = 0; count < 30; count += 1) await Promise.resolve();
}

function modeHarness() {
  const chunks: TerminalInputChunk[] = [];
  let pending: PromiseWithResolvers<IteratorResult<TerminalInputChunk>> | undefined;
  let closed = false;
  let sends = 0;
  const clock = controlledClock();
  const authority = new TerminalInputAuthority({
    isTty: () => true,
    read: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const chunk = chunks.shift();
          if (chunk !== undefined) return Promise.resolve({ done: false as const, value: chunk });
          if (closed) return Promise.resolve({ done: true as const, value: undefined });
          pending = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
          return pending.promise;
        },
        return: () => {
          closed = true;
          pending?.resolve({ done: true, value: undefined });
          return Promise.resolve({ done: true as const, value: undefined });
        },
      }),
    }),
  });
  return {
    authority, clock, sends: () => sends,
    push(data: string | Uint8Array) {
      if (pending === undefined) chunks.push({ data });
      else {
        const read = pending;
        pending = undefined;
        read.resolve({ done: false, value: { data } });
      }
    },
    query(modes: readonly TerminalModeKey[]) {
      const controller = new AbortController();
      const protocol = createTerminalModeResponseProtocol(modes);
      const result = authority.queryTerminal({
        signal: controller.signal, clock, protocol,
        send: () => { sends += 1; return Promise.resolve(); },
      });
      return { controller, protocol, result };
    },
  };
}

function controlledClock(): TerminalClock & { advance(ms: number): void } {
  let now = 0;
  const sleeps: {
    readonly target: number;
    readonly signal?: AbortSignal;
    readonly resolve: (outcome: 'elapsed' | 'aborted') => void;
  }[] = [];
  return {
    monotonicNow: () => now,
    sleep(ms, signal) {
      if (signal?.aborted === true) return Promise.resolve('aborted' as const);
      return new Promise((resolve) => {
        sleeps.push({ target: now + ms, ...(signal === undefined ? {} : { signal }), resolve });
        signal?.addEventListener('abort', () => { resolve('aborted'); }, { once: true });
      });
    },
    advance(ms) {
      now += ms;
      for (let index = sleeps.length - 1; index >= 0; index -= 1) {
        const sleep = sleeps[index];
        if (sleep === undefined || (sleep.target > now && sleep.signal?.aborted !== true)) continue;
        sleeps.splice(index, 1);
        sleep.resolve(sleep.signal?.aborted === true ? 'aborted' : 'elapsed');
      }
    },
  };
}
