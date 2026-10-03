import assert from 'node:assert/strict';
import test from 'node:test';

import { TerminalUiError } from '../errors.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import type { TerminalInputChunk } from '../host/types.ts';
import type { InputPipelineOptions } from '../input/pipeline.ts';
import type { InputEvent } from '../input/types.ts';
import type { Frame } from '../renderer/contracts.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';
import { createRuntimeInputSession } from './input/input-session.ts';
import { createPointerMotionCoordinator } from './input/pointer-motion-coordinator.ts';
import { createWheelInputCoordinator } from './input/wheel-input-coordinator.ts';
import type { TuiInputResult } from './types.ts';

void test('input admission is reserved synchronously before any snapshot or copy', async () => {
  const release = Promise.withResolvers<undefined>();
  const events: InputEvent[] = [];
  const fixture = inputFixture({ maxPendingOperations: 2, async dispatch(event) {
    events.push(event);
    await release.promise;
    return inputResult;
  } });
  const first = fixture.session.handleInput({ kind: 'text', text: 'a', paste: false });
  const data = Buffer.from([98]);
  const second = fixture.session.handleInputChunk({ data });
  data[0] = 99;
  const unreadable = { get data(): string { throw new Error('should not snapshot'); } };
  await assert.rejects(fixture.session.handleInputChunk(unreadable), overloaded('input_operations', 2));
  await assert.rejects(fixture.session.handleInput({ get kind(): 'text' { throw new Error('should not decode'); }, text: 'c', paste: false }), overloaded('input_operations', 2));
  await assert.rejects(fixture.session.flush(), overloaded('input_operations', 2));
  release.resolve(undefined);
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    { kind: 'text', text: 'a', paste: false },
    { kind: 'text', text: 'b', paste: false }
  ]);
  await fixture.session.flush();
});

void test('input chunks are byte-bounded before allocation and rejection releases admission', async () => {
  const fixture = inputFixture({ maxPendingOperations: 1, pipeline: { limits: { maxHostChunkBytes: 4 } } });
  let copies = 0;
  class CountedBytes extends Uint8Array {
    override slice(start?: number, end?: number): Uint8Array<ArrayBuffer> {
      copies += 1;
      return super.slice(start, end);
    }
  }
  await assert.rejects(fixture.session.handleInputChunk({ data: new CountedBytes(5) }), overloaded('input_chunk', 4));
  assert.equal(copies, 0);
  for (const data of ['12345', 'ééé', '😀a', '\ud800é']) {
    await assert.rejects(fixture.session.handleInputChunk({ data }), overloaded('input_chunk', 4));
  }
  await fixture.session.handleInputChunk({ data: '😀' });
  await fixture.session.handleInputChunk({ data: new CountedBytes([65]) });
  assert.equal(copies, 0);
  for (const invalid of [null, [], { data: 2 }, { data: '', extra: true }]) {
    await assert.rejects(fixture.session.handleInputChunk(invalid as TerminalInputChunk), TypeError);
  }
  await fixture.session.flush();
});

void test('input reservations bound pending pointer continuations after chunk promises resolve', async () => {
  const release = Promise.withResolvers<undefined>();
  const fixture = inputFixture({ maxPendingOperations: 2, async motion() {
    await release.promise;
    return inputResult;
  } });
  const first = await fixture.session.handleInputChunk({ data: '\x1b[<32;1;1M' });
  const second = await fixture.session.handleInputChunk({ data: '\x1b[<32;2;1M' });
  assert.notEqual(first.pending, undefined);
  assert.notEqual(second.pending, undefined);
  await assert.rejects(fixture.session.handleInputChunk({ data: '\x1b[<32;3;1M' }), overloaded('input_operations', 2));
  release.resolve(undefined);
  assert.deepEqual(await first.pending, [inputResult]);
  assert.deepEqual(await second.pending, [inputResult]);
  await fixture.session.handleInput({ kind: 'text', text: 'a', paste: false });
});

void test('ambiguity work retains bounded admission and releases it after resolution or rejection', async () => {
  let failed = false;
  const fixture = inputFixture({ maxPendingOperations: 1, async dispatch() {
    if (failed) throw new Error('dispatch failed');
    return inputResult;
  } });
  const first = await fixture.session.handleInputChunk({ data: '\x1b' });
  await assert.rejects(fixture.session.flush(), overloaded('input_operations', 1));
  fixture.host.clock.advance(25);
  assert.deepEqual(await first.pending, [inputResult]);
  failed = true;
  const second = await fixture.session.handleInputChunk({ data: '\x1b' });
  const rejected = assert.rejects(second.pending ?? Promise.resolve(), /dispatch failed/u);
  fixture.host.clock.advance(25);
  await rejected;
  failed = false;
  await fixture.session.handleInput({ kind: 'text', text: 'a', paste: false });
});

void test('input cancellation promptly rejects queued work while active work settles cooperatively', async () => {
  const started = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const fixture = inputFixture({ async dispatch() {
    started.resolve(undefined);
    await release.promise;
    return inputResult;
  } });
  const first = fixture.session.handleInput({ kind: 'text', text: 'a', paste: false });
  await started.promise;
  const second = fixture.session.handleInputChunk({ data: 'b' });
  const rejected = assert.rejects(second, /input is unavailable/u);
  fixture.session.cancel();
  fixture.session.cancel();
  await rejected;
  await assert.rejects(fixture.session.handleInputChunk({ get data(): string { throw new Error('snapshot after cancellation'); } }), /input is unavailable/u);
  release.resolve(undefined);
  assert.equal(await first, inputResult);
  await fixture.session.drain();
});


void test('input has a finite default operation cap while a transaction is blocked', async () => {
  const release = Promise.withResolvers<undefined>();
  const fixture = inputFixture({ async dispatch() { await release.promise; return inputResult; } });
  const requests = Array.from({ length: 256 }, () => fixture.session.handleInput({ kind: 'text', text: 'a', paste: false }));
  await assert.rejects(fixture.session.handleInput({ kind: 'text', text: 'b', paste: false }), overloaded('input_operations', 256));
  release.resolve(undefined);
  await Promise.all(requests);
  await fixture.session.flush();
});

void test('running input does not install a new ambiguity deadline after cancellation', async () => {
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const fixture = inputFixture({ async dispatch() {
    entered.resolve(undefined);
    await release.promise;
    return inputResult;
  } });
  const running = fixture.session.handleInputChunk({ data: 'a\x1b' });
  await entered.promise;
  fixture.session.cancel();
  release.resolve(undefined);
  assert.equal((await running).pending, undefined);
  await fixture.session.drain();
});

void test('invalid input admission limits reject construction', () => {
  for (const maxPendingOperations of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => inputFixture({ maxPendingOperations }), RangeError);
  }
});

const inputResult: TuiInputResult<number> = { handled: true, state: 1, frame: {} as Frame };

function overloaded(reason: string, limit: number): (cause: unknown) => boolean {
  return (cause) => cause instanceof TerminalUiError && cause.code === 'TUI_OVERLOAD'
    && cause.reason === reason && cause.limit === limit;
}

function inputFixture(options: {
  readonly maxPendingOperations?: number;
  readonly pipeline?: InputPipelineOptions;
  readonly dispatch?: (event: InputEvent) => Promise<TuiInputResult<number>>;
  readonly motion?: () => Promise<TuiInputResult<number>>;
} = {}) {
  const host = createMemoryTerminalHost();
  const wheel = createWheelInputCoordinator<TuiInputResult<number>>({
    clock: host.clock, execute: async () => [inputResult], reportFailure: (cause) => { throw cause; }
  });
  const pointer = createPointerMotionCoordinator<TuiInputResult<number>>({
    execute: options.motion ?? (async () => inputResult), stop: () => false,
    reportFailure: (cause) => { throw cause; }
  });
  const session = createRuntimeInputSession({
    clock: host.clock, transaction: createSerializedDispatchQueue(),
    ...(options.maxPendingOperations === undefined ? {} : { maxPendingOperations: options.maxPendingOperations }),
    pipeline: { mouseReporting: 'all', ...options.pipeline },
    assertOperational: () => undefined,
    dispatch: options.dispatch ?? (async () => inputResult),
    bindingState: () => ({ render: undefined, focus: undefined }),
    characterBindings: () => new Set<string>(), recordDecoded: () => undefined,
    wheel, pointer, enqueueWheel: (event) => wheel.enqueue(event, undefined),
    enqueueMotion: (event, occurredAt) => { pointer.enqueue({ event, occurredAt }); }
  });
  return { session, host };
}

void test('direct decoded text and paste admissions honor the same byte bound', async () => {
  const fixture = inputFixture({ pipeline: { limits: { maxHostChunkBytes: 4 } } });
  await assert.rejects(fixture.session.handleInput({ kind: 'text', text: '😀a', paste: false }), overloaded('input_event', 4));
  await assert.rejects(fixture.session.handleInput({ kind: 'paste', text: '12345', bracketed: true }), overloaded('input_event', 4));
  await fixture.session.handleInput({ kind: 'text', text: '😀', paste: false });
});
