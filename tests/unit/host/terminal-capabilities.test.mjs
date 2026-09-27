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
