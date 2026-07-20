import {
  createMemoryTerminalHost,
  resolveTerminalCapabilities,
  type RuntimeTarget,
  type TerminalViewport
} from '@ismail-elkorchi/terminal-ui/host';

const viewport: TerminalViewport = { columns: 80, rows: 24 };
const runtime: RuntimeTarget = 'memory';
const host = createMemoryTerminalHost({ viewport });
const detected = host.getCapabilities({
  activeProbes: ['keyboardProtocol'],
  probeTimeoutMs: 50
});
const capabilities = resolveTerminalCapabilities({
  host: {
    runtime,
    inputIsTty: false,
    outputIsTty: false,
    rawInput: false,
    resizeEvents: true,
    terminalProtocols: false
  },
  environment: {},
  probes: { keyboardProtocol: 'unknown' }
});

// @ts-expect-error viewport dimensions are numeric terminal cells
const invalidViewport: TerminalViewport = { columns: '80', rows: 24 };

void host;
void detected;
void capabilities;
void invalidViewport;
