import assert from 'node:assert/strict';
import test from 'node:test';
import { TerminalInputAuthority } from './input-authority.ts';
import { RuntimeInput, runtimeInputSourceFromAsyncIterable } from './runtime-streams.ts';
import type { RuntimeInputSource } from './types.ts';

void test('runtime input reaches cooperative iterator cleanup while a source read is pending', async () => {
  const read = Promise.withResolvers<IteratorResult<string>>();
  let returned = 0;
  const source = runtimeInputSourceFromAsyncIterable({
    [Symbol.asyncIterator]: () => ({
      next: () => read.promise,
      return: () => {
        returned += 1;
        read.resolve({ done: true, value: undefined });
        return Promise.resolve({ done: true, value: undefined });
      }
    })
  });
  const authority = new TerminalInputAuthority(new RuntimeInput({ source }));
  const pending = authority.read()[Symbol.asyncIterator]().next();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const release = authority.release();
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(returned, 1, 'return must not wait behind the read it retires');
  } finally {
    read.resolve({ done: true, value: undefined });
    await release;
    await pending;
    await authority.dispose();
  }
});

for (const wrapped of [false, true]) {
  void test(`runtime input preserves a handoff chunk through ${wrapped ? 'the iterable adapter' : 'a custom source'}`, async () => {
    const read = Promise.withResolvers<IteratorResult<string>>();
    let generation = 0;
    const iterable: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        const initial = generation++ === 0;
        return {
          next: () => initial ? read.promise : Promise.resolve({ done: true, value: undefined }),
          return: () => Promise.resolve({ done: true, value: undefined })
        };
      }
    };
    const source: RuntimeInputSource = wrapped
      ? runtimeInputSourceFromAsyncIterable(iterable)
      : { read: () => iterable };
    const authority = new TerminalInputAuthority(new RuntimeInput({ source }));
    const pending = authority.read()[Symbol.asyncIterator]().next();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const release = authority.release();
    read.resolve({ done: false, value: 'preserved' });
    await release;
    assert.deepEqual(await pending, { done: true, value: undefined });
    const replacement = authority.read()[Symbol.asyncIterator]();
    try {
      assert.deepEqual(await replacement.next(), { done: false, value: { data: 'preserved' } });
      assert.equal((await replacement.next()).done, true, 'handoff byte is replayed exactly once');
    } finally {
      await replacement.return?.();
      await authority.dispose();
    }
  });
}

void test('source retirement starts independently of a pending iterator and preserves failures', async () => {
  for (const fail of [false, true]) {
    const read = Promise.withResolvers<IteratorResult<string>>();
    const retired = Promise.withResolvers<undefined>();
    let releaseCalls = 0;
    const failure = new Error('native retirement failed');
    const input = new RuntimeInput({ source: {
      read: () => ({ [Symbol.asyncIterator]: () => ({
        next: () => read.promise,
        return: async () => { await retired.promise; return { done: true, value: undefined }; }
      }) }),
      release: () => {
        releaseCalls += 1;
        read.resolve({ done: true, value: undefined });
        retired.resolve(undefined);
        return fail ? Promise.reject(failure) : Promise.resolve();
      }
    } });
    const authority = new TerminalInputAuthority(input);
    const pending = authority.read()[Symbol.asyncIterator]().next();
    const release = authority.release();
    if (fail) {
      await assert.rejects(release, (cause) => cause === failure);
      assert.throws(() => authority.read()[Symbol.asyncIterator](), /being released/u);
      await assert.rejects(authority.dispose(), (cause) => cause === failure);
    } else {
      await release;
      await authority.dispose();
    }
    assert.deepEqual(await pending, { done: true, value: undefined });
    assert.equal(releaseCalls, fail ? 1 : 2);
  }
});

void test('runtime input reports a native read failure racing reusable release', async () => {
  const read = Promise.withResolvers<IteratorResult<string>>();
  const failure = new Error('native read failed during release');
  const source = runtimeInputSourceFromAsyncIterable({
    [Symbol.asyncIterator]: () => ({
      next: () => read.promise,
      return: () => Promise.resolve({ done: true, value: undefined })
    })
  });
  const input = new RuntimeInput({ source });
  const authority = new TerminalInputAuthority(input);
  const pending = authority.read()[Symbol.asyncIterator]().next();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const release = authority.release();
  read.reject(failure);
  await assert.rejects(release, (cause) => cause === failure);
  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.throws(() => authority.read()[Symbol.asyncIterator](), /being released/u);
  await assert.rejects(authority.dispose(), (cause) => cause === failure);
});

void test('reusable stream-host release does not dispose its source and permanent disposal is shared', async () => {
  const { createBunTerminalHost } = await import('./bun.ts');
  let releases = 0;
  let disposals = 0;
  const host = createBunTerminalHost({
    stdin: { source: {
      read: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }) }),
      release: () => { releases += 1; return Promise.resolve(); },
      dispose: () => { disposals += 1; return Promise.resolve(); }
    } },
    stdout: { write() {} },
    stderr: { write() {} },
    subscribeSignals: () => () => undefined
  });
  await host.stdin.release?.();
  assert.equal(releases, 1);
  assert.equal(disposals, 0);
  await Promise.all([host.dispose(), host.dispose()]);
  assert.equal(releases, 2);
  assert.equal(disposals, 1);
  assert.deepEqual(await host.stdin.read()[Symbol.asyncIterator]().next(), { done: true, value: undefined });
});

void test('early iterator close rejection remains observed until pending read retirement', async () => {
  const read = Promise.withResolvers<IteratorResult<string>>();
  const failure = new Error('early close failed');
  const input = new RuntimeInput({ source: runtimeInputSourceFromAsyncIterable({
    [Symbol.asyncIterator]: () => ({
      next: () => read.promise,
      return: () => Promise.reject(failure)
    })
  }) });
  const authority = new TerminalInputAuthority(input);
  const pending = authority.read()[Symbol.asyncIterator]().next();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const release = authority.release();
  const rejected = assert.rejects(release, (cause) => cause === failure);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.throws(() => authority.read()[Symbol.asyncIterator](), /being released/u);
  read.resolve({ done: true, value: undefined });
  await rejected;
  await pending;
  await assert.rejects(authority.dispose(), (cause) => cause === failure);
});

for (const code of ['ERR_STREAM_PREMATURE_CLOSE', 'ABORT_ERR']) {
  void test(`runtime input does not silently classify ${code} as a successful release`, async () => {
    const read = Promise.withResolvers<IteratorResult<string>>();
    const failure = Object.assign(new Error('native cancellation failed'), { code });
    const authority = new TerminalInputAuthority(new RuntimeInput({ source: runtimeInputSourceFromAsyncIterable({
      [Symbol.asyncIterator]: () => ({
        next: () => read.promise,
        return: () => Promise.resolve({ done: true, value: undefined })
      })
    }) }));
    const pending = authority.read()[Symbol.asyncIterator]().next();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const release = authority.release();
    read.reject(failure);
    await assert.rejects(release, (cause) => cause === failure);
    await pending;
    await assert.rejects(authority.dispose(), (cause) => cause === failure);
  });
}
