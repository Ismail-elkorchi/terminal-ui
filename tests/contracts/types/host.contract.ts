import {
  createMemoryTerminalHost,
  resolveTerminalCapabilities,
  type RuntimeTerminalOutputOptions,
  type RuntimeTarget,
  type TerminalClock,
  type TerminalCellPresentationQualification,
  type TerminalBidiMode,
  type TerminalCellPresentation,
  type TerminalOperationAssurance,
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
    supportsRawInput: false,
    supportsResizeEvents: true,
    supportsTerminalProtocols: false
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

const qualification: TerminalCellPresentationQualification = { qualification: 'mode-8-reset' };
const declaredHost = createMemoryTerminalHost({ cellPresentation: qualification, initialState: { bidiMode: 'implicit' } });
const rawMode: TerminalBidiMode = 'explicit';
const physicalCells: TerminalCellPresentation = 'application-ordered';
const declaredAssurance: TerminalOperationAssurance = 'declared';
// @ts-expect-error raw explicit mode is not the full physical-cell contract
const rawIsNotPhysical: TerminalCellPresentation = 'explicit';
// @ts-expect-error desired state is not caller qualification
createMemoryTerminalHost({ cellPresentation: 'application-ordered' });
// @ts-expect-error derived full presentation cannot be supplied as raw initial state
createMemoryTerminalHost({ initialState: { cellPresentation: 'explicit' } });
void declaredHost;
void rawMode;
void physicalCells;
void declaredAssurance;
void rawIsNotPhysical;

// @ts-expect-error full physical-cell proof is not a generic capability override
createMemoryTerminalHost({ capabilities: { overrides: { cellPresentation: true } } });
// @ts-expect-error a generic mode-support probe cannot establish the full invariant
createMemoryTerminalHost({ capabilities: { probes: { cellPresentation: 'supported' } } });
