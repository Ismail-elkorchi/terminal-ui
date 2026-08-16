import { createTerminalHost, success } from '@ismail-elkorchi/terminal-ui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createProtocolWriter } from '@ismail-elkorchi/terminal-ui/protocol';

const rootHost = createTerminalHost({ runtime: 'memory' });
const memoryHost = createMemoryTerminalHost();
const protocolWrites = [];
const writer = createProtocolWriter({
  write: async (value) => { protocolWrites.push(value); }
});

await memoryHost.write({ text: 'ordered' });
await memoryHost.flush();
await writer.enableBracketedPaste();
await writer.disableBracketedPaste();

invariant(rootHost.runtime === 'memory', 'root host selection failed');
invariant(memoryHost.output() === 'ordered', 'memory output ordering failed');
invariant(protocolWrites.join('') === '\u001B[?2004h\u001B[?2004l', 'protocol sequence failed');
invariant(success('value').status === 'success', 'root result contract failed');

console.log(JSON.stringify({ scenario: 'core-host-protocol', status: 'passed' }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
