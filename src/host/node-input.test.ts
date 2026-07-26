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

void test('aborting a pending native read settles it without destroying stdin', async () => {
  const stream = new Readable({ read() {} });
  const input = new NodeInput(stream);
  const controller = new AbortController();
  const reader = input.read({ signal: controller.signal })[Symbol.asyncIterator]();
  const pending = reader.next();

  controller.abort();

  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.equal(stream.destroyed, false);
  stream.push('release pending native read');
  stream.push(null);
  await new Promise<void>((resolve) => { setImmediate(resolve); });
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
  const stream: NodeReadableTerminalStream = {
    iterator: () => pendingValues(),
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
