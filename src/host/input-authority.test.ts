import assert from 'node:assert/strict';
import test from 'node:test';

import { TerminalInputAuthority } from './input-authority.ts';
import {
  RuntimeInput,
  runtimeInputSourceFromAsyncIterable
} from './runtime-streams.ts';
import type { TerminalClock, TerminalInputChunk } from './types.ts';

const probeClock: TerminalClock = {
  monotonicNow: () => 0,
  sleep: (_ms, signal) => new Promise<void>((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      reject(new Error('Probe clock wait was cancelled.', { cause: signal.reason }));
    }, { once: true });
  })
};

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

void test('reader handoff transfers one pending chunk without delivering it twice', async () => {
  const sourceRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  const sharedIterator: AsyncIterator<TerminalInputChunk> = {
    next: () => sourceRead.promise
  };
  const source: import('./types.ts').TerminalInput = {
    read: () => ({ [Symbol.asyncIterator]: () => sharedIterator }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const first = authority.read()[Symbol.asyncIterator]();
  const retiredRead = first.next();
  await first.return?.();
  const replacement = authority.read()[Symbol.asyncIterator]();
  const replacementRead = replacement.next();

  sourceRead.resolve({ done: false, value: { data: 'once' } });

  assert.deepEqual(await retiredRead, { done: true, value: undefined });
  assert.deepEqual(await replacementRead, { done: false, value: { data: 'once' } });
  await replacement.return?.();
  await authority.dispose();
});

void test('an aborted capability probe transfers its late read and removes only the response', async () => {
  const probeRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  const applicationRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  let reads = 0;
  const sharedIterator: AsyncIterator<TerminalInputChunk> = {
    next: () => reads++ === 0 ? probeRead.promise : applicationRead.promise
  };
  const source: import('./types.ts').TerminalInput = {
    read: () => ({ [Symbol.asyncIterator]: () => sharedIterator }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const controller = new AbortController();
  const probing = authority.probeKittyKeyboard(controller.signal, probeClock);

  controller.abort();
  assert.deepEqual(await probing, { status: 'inconclusive' });
  const replacement = authority.read()[Symbol.asyncIterator]();
  const first = replacement.next();
  probeRead.resolve({
    done: false,
    value: { data: 'before\u001B[?7uafter' }
  });
  const firstResult = await first;
  if (firstResult.done) assert.fail('Expected replayed input after the probe.');
  assert.equal(inputText(firstResult.value.data), 'beforeafter');

  const second = replacement.next();
  applicationRead.resolve({ done: false, value: { data: 'application input' } });
  const secondResult = await second;
  if (secondResult.done) assert.fail('Expected application input after the probe response.');
  assert.equal(inputText(secondResult.value.data), 'application input');
  await replacement.return?.();
  await authority.dispose();
});

void test('input release filters a transferred probe read before replaying it', async () => {
  const probeRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  const sharedIterator: AsyncIterator<TerminalInputChunk> = {
    next: () => probeRead.promise
  };
  const source: import('./types.ts').TerminalInput = {
    read: () => ({ [Symbol.asyncIterator]: () => sharedIterator }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const controller = new AbortController();
  const probing = authority.probeKittyKeyboard(controller.signal, probeClock);

  controller.abort();
  assert.deepEqual(await probing, { status: 'inconclusive' });
  const releasing = authority.release();
  probeRead.resolve({ done: false, value: { data: '\u001B[?7utyped' } });
  await releasing;

  const replacement = authority.read()[Symbol.asyncIterator]();
  const replayed = await replacement.next();
  if (replayed.done) assert.fail('Expected user input surrounding the late probe response.');
  assert.equal(inputText(replayed.value.data), 'typed');
  await replacement.return?.();
  await authority.dispose();
});

void test('a capability response split across timeout is removed as one token', async () => {
  const firstRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  const lateRead = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
  let reads = 0;
  const source: import('./types.ts').TerminalInput = {
    read: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => reads++ === 0 ? firstRead.promise : lateRead.promise
      })
    }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const controller = new AbortController();
  const probing = authority.probeKittyKeyboard(controller.signal, probeClock);

  firstRead.resolve({ done: false, value: { data: 'before\u001B[?' } });
  await Promise.resolve();
  controller.abort();
  assert.deepEqual(await probing, { status: 'inconclusive' });

  const replacement = authority.read()[Symbol.asyncIterator]();
  const before = await replacement.next();
  if (before.done) assert.fail('Expected input preceding the split response.');
  assert.equal(inputText(before.value.data), 'before');

  const afterRead = replacement.next();
  lateRead.resolve({ done: false, value: { data: '7uafter' } });
  const after = await afterRead;
  if (after.done) assert.fail('Expected input following the split response.');
  assert.equal(inputText(after.value.data), 'after');
  await replacement.return?.();
  await authority.dispose();
});

void test('a primary device-attributes fence establishes unsupported Kitty input', async () => {
  const source: import('./types.ts').TerminalInput = {
    read: () => ({
      async *[Symbol.asyncIterator]() {
        yield { data: 'before\u001B[?' };
        yield { data: '1;2cafter' };
      }
    }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);

  assert.deepEqual(
    await authority.probeKittyKeyboard(new AbortController().signal, probeClock),
    { status: 'unsupported' }
  );
  const replacement = authority.read()[Symbol.asyncIterator]();
  const first = await replacement.next();
  const second = await replacement.next();
  if (first.done || second.done) assert.fail('Expected input surrounding the response fence.');
  assert.equal(inputText(first.value.data) + inputText(second.value.data), 'beforeafter');
  await replacement.return?.();
  await authority.dispose();
});

void test('user input before a late split capability response is replayed without disabling filtering', async () => {
  const reads: PromiseWithResolvers<IteratorResult<TerminalInputChunk>>[] = [];
  const source: import('./types.ts').TerminalInput = {
    read: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => {
          const read = Promise.withResolvers<IteratorResult<TerminalInputChunk>>();
          reads.push(read);
          return read.promise;
        }
      })
    }),
    isTty: () => true
  };
  const authority = new TerminalInputAuthority(source);
  const controller = new AbortController();
  const probing = authority.probeKittyKeyboard(controller.signal, probeClock);

  controller.abort();
  assert.deepEqual(await probing, { status: 'inconclusive' });
  const replacement = authority.read()[Symbol.asyncIterator]();
  const userRead = replacement.next();
  reads[0]?.resolve({ done: false, value: { data: 'typed' } });
  const user = await userRead;
  if (user.done) assert.fail('Expected user input before the late response.');
  assert.equal(inputText(user.value.data), 'typed');

  const afterRead = replacement.next();
  reads[1]?.resolve({ done: false, value: { data: '\u001B[?' } });
  await waitForReadCount(reads, 3);
  reads[2]?.resolve({ done: false, value: { data: '7uafter' } });
  const after = await afterRead;
  if (after.done) assert.fail('Expected user input after the late response.');
  assert.equal(inputText(after.value.data), 'after');
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

function inputText(data: string | Uint8Array): string {
  return typeof data === 'string' ? data : new TextDecoder().decode(data);
}

async function waitForReadCount(
  reads: readonly PromiseWithResolvers<IteratorResult<TerminalInputChunk>>[],
  expected: number
): Promise<void> {
  for (let attempt = 0; attempt < 20 && reads.length < expected; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(reads.length, expected);
}
