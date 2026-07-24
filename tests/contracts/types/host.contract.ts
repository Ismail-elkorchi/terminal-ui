import {
  createMemoryTerminalHost,
  resolveTerminalCapabilities,
  type RuntimeTerminalOutputOptions,
  type RuntimeTarget,
  type TerminalSize
} from '@ismail-elkorchi/terminal-ui/host';

const terminalSize: TerminalSize = { columns: 80, rows: 24 };
const runtime: RuntimeTarget = 'memory';
const host = createMemoryTerminalHost({ terminalSize });
const recoveryOutput: RuntimeTerminalOutputOptions = {
  recoveryWrite: () => undefined
};
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

// @ts-expect-error terminal-size dimensions are numeric terminal cells
const invalidTerminalSize: TerminalSize = { columns: '80', rows: 24 };
// @ts-expect-error host options no longer call terminal dimensions a viewport
createMemoryTerminalHost({ viewport: terminalSize });
// @ts-expect-error hosts expose terminal dimensions through getTerminalSize
type RemovedGetViewport = typeof host['getViewport'];
// @ts-expect-error recovery writes are no longer exposed as safety writes
type RemovedWriteSafety = typeof host['writeSafety'];
// @ts-expect-error runtime output adapters name the restoration path recoveryWrite
const removedSafetyWrite: RuntimeTerminalOutputOptions = { safetyWrite: () => undefined };

void host;
void recoveryOutput;
void detected;
void capabilities;
void invalidTerminalSize;
void (undefined as unknown as RemovedGetViewport);
void (undefined as unknown as RemovedWriteSafety);
void removedSafetyWrite;
