import {
  createMemoryTerminalHost,
  resolveTerminalCapabilities,
  type RuntimeTerminalOutputOptions,
  type RuntimeTarget,
  type TerminalClock,
  type TerminalSleepOutcome,
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
const clock: TerminalClock = {
  monotonicNow: () => 0,
  sleep: async (): Promise<TerminalSleepOutcome> => 'elapsed'
};

const invalidClock: TerminalClock = {
  monotonicNow: () => 0,
  // @ts-expect-error clock sleeps must distinguish elapsed deadlines from cancellation
  sleep: async (): Promise<void> => undefined
};

// @ts-expect-error terminal-size dimensions are numeric terminal cells
const invalidTerminalSize: TerminalSize = { columns: '80', rows: 24 };

void host;
void recoveryOutput;
void detected;
void capabilities;
void clock;
void invalidClock;
void invalidTerminalSize;
