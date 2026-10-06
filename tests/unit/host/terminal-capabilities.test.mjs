import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTerminalCapabilities } from '../../../dist/host/index.js';

test('inconclusive tmux probes retain evidence and explicit rejections override it', () => {
  const input = {
    host: { runtime: 'node', inputIsTty: true, outputIsTty: true, supportsRawInput: true,
      supportsResizeEvents: true, supportsTerminalProtocols: true },
    environment: { variables: { TERM: 'tmux-256color' } },
  };
  for (const name of ['alternateScreen', 'cursorVisibility', 'mouseReporting']) {
    assert.equal(resolveTerminalCapabilities(input)[name].support, 'supported');
    assert.equal(resolveTerminalCapabilities({ ...input, probes: { [name]: 'unknown' } })[name].support, 'supported');
    assert.equal(resolveTerminalCapabilities({ ...input, probes: { [name]: 'unsupported' } })[name].support, 'unsupported');
  }
});


test('automatic alternate-screen policy admits VT assumptions but rejects known limited terminals', () => {
  const host = { runtime: 'node', inputIsTty: true, outputIsTty: true, supportsRawInput: true,
    supportsResizeEvents: true, supportsTerminalProtocols: true };
  for (const term of ['xterm-256color', 'screen-256color', 'tmux-256color', 'vendor-vt']) {
    const input = { host, environment: { variables: { TERM: term } } };
    assert.equal(resolveTerminalCapabilities(input).alternateScreen.support, 'supported', term);
    assert.equal(resolveTerminalCapabilities({ ...input, probes: { alternateScreen: 'unsupported' } }).alternateScreen.support, 'unsupported', term);
  }
  for (const term of ['dumb', 'linux', 'vt100', 'vt220']) {
    assert.equal(resolveTerminalCapabilities({ host, environment: { variables: { TERM: term } } }).alternateScreen.support, 'unsupported', term);
  }
  assert.equal(resolveTerminalCapabilities({ host: { ...host, outputIsTty: false } }).alternateScreen.support, 'unsupported');
  assert.equal(resolveTerminalCapabilities({ host, environment: { variables: { TERM: 'vt100' } },
    probes: { alternateScreen: 'supported' } }).alternateScreen.support, 'supported', 'current positive mode evidence takes precedence');
});
