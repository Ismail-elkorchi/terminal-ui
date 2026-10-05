import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { queriedModes } from '../../../dist/host/terminal-mode-query.js';

test('Meta-as-Escape is probed, owned by nested sessions, and restored to observed state', async () => {
  const host = createMemoryTerminalHost();
  host.input(queriedModes.map(mode => {
    const [namespace, number] = mode.split(':');
    return `\u001b[${namespace === 'private' ? '?' : ''}${number};${mode === 'private:1036' ? '2' : '0'}$y`;
  }).join('') + '\u001b[?1;2c');
  const capabilities = await host.getCapabilities({ activeProbes: ['terminalModes'] });
  assert.equal(capabilities.metaSendsEscape.support, 'supported');
  const outer = await host.beginSession();
  assert.equal(outer.initialState.metaSendsEscape, false);
  assert.equal(outer.initialState.provenance.metaSendsEscape, 'observed');
  assert.equal((await outer.enableMetaSendsEscape()).status, 'applied');
  const inner = await host.beginSession();
  await inner.enableMetaSendsEscape();
  await inner.restore();
  assert.equal((await outer.currentState()).metaSendsEscape, true);
  await outer.restore();
  assert.match(host.output(), /\u001b\[\?1036h/u);
  assert.match(host.output(), /\u001b\[\?1036l/u);
  await host.dispose();
});
