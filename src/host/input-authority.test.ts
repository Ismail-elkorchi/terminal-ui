import assert from 'node:assert/strict';
import test from 'node:test';

import { TerminalInputAuthority } from './input-authority.ts';
import {
  RuntimeInput,
  runtimeInputSourceFromAsyncIterable
} from './runtime-streams.ts';
import type { TerminalInputChunk } from './types.ts';

void test('caller abort stops waiting while the shared async source remains owned', async () => {
  const read = Promise.withResolvers<IteratorResult<Uint8Array>>();
  const close = Promise.withResolvers<IteratorResult<Uint8Array>>();
  const source = asyncIterable({
    next: () => read.promise,
    return: () => close.promise
  });
  const authority = authorityFor(source);
  const controller = new AbortController();
  const reader = authority.read({ signal: controller.signal })[Symbol.asyncIterator]();
  const pending = reader.next();

  controller.abort();
  assert.deepEqual(await pending, { done: true, value: undefined });

  const disposal = authority.dispose();
  let disposed = false;
  void disposal.then(() => { disposed = true; });
  await Promise.resolve();
  assert.equal(disposed, false);
  read.resolve({ done: true, value: undefined });
  close.resolve({ done: true, value: undefined });
  await disposal;
  assert.equal(disposed, true);
});

void test('shared async source cleanup reports return failures without losing disposal state', async () => {
  const read = Promise.withResolvers<IteratorResult<Uint8Array>>();
  const source = asyncIterable({
    next: () => read.promise,
    return: () => Promise.reject(new Error('async source detach failed'))
  });
  const authority = authorityFor(source);
  const controller = new AbortController();
  const pending = authority.read({ signal: controller.signal })[Symbol.asyncIterator]().next();

  controller.abort();
  await pending;
  read.resolve({ done: true, value: undefined });
  const first = authority.dispose();
  const second = authority.dispose();
  assert.equal(first, second);
  await assert.rejects(first, /async source detach failed/u);
  await assert.rejects(second, /async source detach failed/u);
});

void test('input disposal starts iterator return before awaiting its pending read', async () => {
  const next = Promise.withResolvers<IteratorResult<import('./types.ts').TerminalInputChunk>>();
  const source: import('./types.ts').TerminalInput = {
    read: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => next.promise,
        return: () => {
          next.resolve({ done: true, value: undefined });
          return Promise.resolve({ done: true as const, value: undefined });
        }
      })
    }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const pending = authority.read()[Symbol.asyncIterator]().next();

  await authority.dispose();
  assert.deepEqual(await pending, { done: true, value: undefined });
});

void test('input release preserves a chunk consumed by a shared iterator before handoff', async () => {
  const firstRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  const close = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  let returnStarted = false;
  const sharedIterator: AsyncIterator<TerminalInputChunk> = {
    next: () => firstRead.promise,
    return: () => {
      returnStarted = true;
      return close.promise;
    }
  };
  const source: import('./types.ts').TerminalInput = {
    read: () => ({
      [Symbol.asyncIterator]: () => sharedIterator
    }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const firstReader = authority.read()[Symbol.asyncIterator]();
  const pending = firstReader.next();

  const releasing = authority.release();
  let released = false;
  void releasing.then(() => { released = true; });
  await Promise.resolve();

  assert.equal(returnStarted, true);
  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.equal(released, false);
  assert.throws(
    () => authority.read()[Symbol.asyncIterator](),
    /being released/u
  );
  firstRead.resolve({ done: false, value: { data: 'preserved' } });
  close.resolve({ done: true, value: undefined });
  await releasing;
  const replacement = authority.read()[Symbol.asyncIterator]();
  const replacementResult = await replacement.next();
  assert.equal(replacementResult.done, false);
  assert.equal(replacementResult.value.data, 'preserved');
  await replacement.return?.();
  await authority.dispose();
});

function authorityFor(source: AsyncIterable<Uint8Array>): TerminalInputAuthority {
  return new TerminalInputAuthority(new RuntimeInput({
    source: runtimeInputSourceFromAsyncIterable(source)
  }));
}

function asyncIterable(iterator: AsyncIterator<Uint8Array>): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => iterator
  };
}
