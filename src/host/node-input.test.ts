import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { NodeInput } from './node-input.ts';
import type { NodeReadableTerminalStream, TerminalInputChunk } from './types.ts';

void test('Node input prefers the non-destructive native stream iterator', async () => {
  let iteratorOptions: { readonly destroyOnReturn?: boolean } | undefined;
  const stream: NodeReadableTerminalStream = {
    iterator(options) {
      iteratorOptions = options;
      return values('native');
    },
    [Symbol.asyncIterator]() {
      throw new Error('fallback iterator should not be used');
    }
  };
  const input = new NodeInput(stream);
  const reader = input.read()[Symbol.asyncIterator]();

  assert.equal(text(await reader.next()), 'native');
  await reader.return?.();
  assert.deepEqual(iteratorOptions, { destroyOnReturn: false });
});

void test('Node input falls back to a custom async-iterable stream', async () => {
  const input = new NodeInput({
    async *[Symbol.asyncIterator]() {
      yield 'custom';
    }
  });
  const reader = input.read()[Symbol.asyncIterator]();

  assert.equal(text(await reader.next()), 'custom');
  assert.equal((await reader.next()).done, true);
});

void test('aborting a pending Node stream read detaches without destroying stdin', async () => {
  const stream = new Readable({ read() {} });
  const input = new NodeInput(stream);
  const controller = new AbortController();
  const reader = input.read({ signal: controller.signal })[Symbol.asyncIterator]();
  const pending = reader.next();

  controller.abort();

  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.equal(stream.destroyed, false);
  const later = stream.iterator({ destroyOnReturn: false });
  stream.push('later consumer');
  assert.equal(nativeText(await later.next()), 'later consumer');
  await later.return?.();
  stream.push(null);
});

void test('Node input reports stream end, close, and errors', async () => {
  const ending = new NodeInput(Readable.from(['end']));
  const endingReader = ending.read()[Symbol.asyncIterator]();
  assert.equal(text(await endingReader.next()), 'end');
  assert.equal((await endingReader.next()).done, true);

  const closingStream = new Readable({ read() {} });
  const closing = new NodeInput(closingStream);
  const closingRead = closing.read()[Symbol.asyncIterator]().next();
  closingStream.destroy();
  assert.equal((await closingRead).done, true);

  const failingStream = new Readable({ read() {} });
  const failing = new NodeInput(failingStream);
  const failingRead = failing.read()[Symbol.asyncIterator]().next();
  failingStream.destroy(new Error('stdin failed'));
  await assert.rejects(failingRead, /stdin failed/u);
});

void test('disposing Node input settles active readers and releases stream ownership', async () => {
  let paused = false;
  let unreferenced = false;
  const sourceRead = Promise.withResolvers<IteratorResult<string | Uint8Array>>();
  const stream: NodeReadableTerminalStream = {
    iterator: () => ({
      next: () => sourceRead.promise,
      return: () => {
        sourceRead.resolve({ done: true, value: undefined });
        return Promise.resolve({ done: true, value: undefined });
      }
    }),
    [Symbol.asyncIterator]: pendingValues,
    pause() {
      paused = true;
    },
    unref() {
      unreferenced = true;
    }
  };
  const input = new NodeInput(stream);
  const pending = input.read()[Symbol.asyncIterator]().next();

  await input.dispose();

  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.equal(paused, true);
  assert.equal(unreferenced, true);
});

void test('disposing Node input detaches from a Node stream before a later consumer reads', async () => {
  const stream = new Readable({ read() {} });
  const input = new NodeInput(stream);
  const pending = input.read()[Symbol.asyncIterator]().next();

  await input.dispose();
  assert.deepEqual(await pending, { done: true, value: undefined });

  const later = stream.iterator({ destroyOnReturn: false });
  stream.push('preserved');
  assert.equal(nativeText(await later.next()), 'preserved');
  await later.return?.();
  stream.push(null);
});

void test('custom iterator close failures keep input ownership unavailable', async () => {
  let generation = 0;
  const sourceRead = Promise.withResolvers<IteratorResult<string | Uint8Array>>();
  const input = new NodeInput({
    iterator() {
      generation += 1;
      if (generation === 1) {
        return {
          next: () => sourceRead.promise,
          return: () => Promise.reject(new Error('detach failed'))
        };
      }
      return values('replacement');
    },
    [Symbol.asyncIterator]: pendingValues
  });
  const reader = input.read()[Symbol.asyncIterator]();
  const pending = reader.next();
  const returnReader = reader.return?.bind(reader);
  if (returnReader === undefined) throw new Error('Node input reader must support return().');

  const closing = returnReader();
  sourceRead.resolve({ done: true, value: undefined });
  await assert.rejects(closing, /detach failed/u);
  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.throws(
    () => input.read()[Symbol.asyncIterator](),
    /already has an active reader/u
  );
  await assert.rejects(input.dispose(), /detach failed/u);
});

void test('custom iterator remains owned until its pending read and close settle', async () => {
  const sourceRead = Promise.withResolvers<IteratorResult<string | Uint8Array>>();
  const close = Promise.withResolvers<IteratorResult<string | Uint8Array>>();
  const input = new NodeInput({
    iterator: () => ({
      next: () => sourceRead.promise,
      return: () => close.promise
    }),
    [Symbol.asyncIterator]: pendingValues
  });
  const reader = input.read()[Symbol.asyncIterator]();
  const pending = reader.next();
  const closing = reader.return?.();
  let closed = false;
  void closing?.then(() => { closed = true; });

  assert.throws(
    () => input.read()[Symbol.asyncIterator](),
    /already has an active reader/u
  );
  close.resolve({ done: true, value: undefined });
  await Promise.resolve();
  assert.equal(closed, false);
  sourceRead.resolve({ done: true, value: undefined });
  assert.deepEqual(await pending, { done: true, value: undefined });
  await closing;
});

void test('releasing custom input waits for the actual pending source read', async () => {
  const sourceRead = Promise.withResolvers<IteratorResult<string | Uint8Array>>();
  const close = Promise.withResolvers<IteratorResult<string | Uint8Array>>();
  let generation = 0;
  const input = new NodeInput({
    iterator() {
      generation += 1;
      return generation === 1
        ? {
            next: () => sourceRead.promise,
            return: () => close.promise
          }
        : values('replacement');
    },
    [Symbol.asyncIterator]: pendingValues
  });
  const firstReader = input.read()[Symbol.asyncIterator]();
  const pending = firstReader.next();

  const releasing = input.release();
  let released = false;
  void releasing.then(() => { released = true; });
  await Promise.resolve();

  assert.equal(released, false);
  assert.throws(
    () => input.read()[Symbol.asyncIterator](),
    /being released/u
  );
  close.resolve({ done: true, value: undefined });
  await Promise.resolve();
  assert.equal(released, false);
  sourceRead.resolve({ done: false, value: 'preserved' });
  assert.equal(text(await pending), 'preserved');
  await releasing;
  assert.equal(text(await input.read()[Symbol.asyncIterator]().next()), 'replacement');
  await input.dispose();
});

void test('repeated Node input abort and disposal calls share cleanup', async () => {
  const stream = new Readable({ read() {} });
  const input = new NodeInput(stream);
  const controller = new AbortController();
  const pending = input.read({ signal: controller.signal })[Symbol.asyncIterator]().next();

  controller.abort();
  controller.abort();
  await Promise.all([input.dispose(), input.dispose()]);

  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.equal(stream.destroyed, false);
});

void test('Node input preserves burst chunks and rejects competing readers', async () => {
  const input = new NodeInput(Readable.from(['a', 'b', 'c'], { objectMode: true }));
  const reader = input.read()[Symbol.asyncIterator]();

  assert.throws(
    () => input.read()[Symbol.asyncIterator](),
    /already has an active reader/u
  );
  assert.deepEqual([
    text(await reader.next()),
    text(await reader.next()),
    text(await reader.next())
  ], ['a', 'b', 'c']);
  assert.equal((await reader.next()).done, true);
});

function values(...chunks: readonly (string | Uint8Array)[]): AsyncIterator<string | Uint8Array> {
  return (async function* generate() {
    yield* chunks;
  })();
}

function pendingValues(): AsyncIterator<string | Uint8Array> {
  return {
    next: () => new Promise<IteratorResult<string | Uint8Array>>(() => undefined),
    return: () => Promise.resolve({ done: true, value: undefined })
  };
}

function text(result: IteratorResult<TerminalInputChunk>): string | undefined {
  if (result.done === true) return undefined;
  return typeof result.value.data === 'string'
    ? result.value.data
    : new TextDecoder().decode(result.value.data);
}

function nativeText(result: IteratorResult<unknown>): string | undefined {
  if (result.done === true) return undefined;
  if (typeof result.value === 'string') return result.value;
  if (result.value instanceof Uint8Array) return new TextDecoder().decode(result.value);
  throw new Error('Native stream returned an invalid input chunk.');
}
