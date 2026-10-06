import {
  createMemoryTerminalHost,
  resolveTerminalCapabilities,
  type RuntimeTerminalOutputOptions,
  type RuntimeTarget,
  type TerminalClock,
  type TerminalCapabilityConfiguration,
  type TerminalCellPresentationConfiguration,
  type TerminalCellPresentationException,
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

const scopedException: TerminalCellPresentationException = { condition: 'kitty-force-ltr', context: 'captured-exact-context' };
const presentationPolicy: TerminalCellPresentationConfiguration = { policy: 'strict' };
const presentationCapabilities: TerminalCapabilityConfiguration = {
  cellPresentation: {
    policy: 'auto',
    exceptions: [scopedException],
  },
};
const automaticHost = createMemoryTerminalHost({ capabilities: presentationCapabilities,
  initialState: { bidiMode: 'implicit' } });
const strictHost = createMemoryTerminalHost({ capabilities: { cellPresentation: presentationPolicy } });
const immutableExceptions = [{ condition: 'konsole-bidi-disabled', context: 'captured-exact-context' }] as const;
createMemoryTerminalHost({ capabilities: { cellPresentation: { exceptions: immutableExceptions } } });
const rawMode: TerminalBidiMode = 'explicit';
const physicalCells: TerminalCellPresentation = 'application-ordered';
const assumedAssurance: TerminalOperationAssurance = 'assumed';
// @ts-expect-error raw explicit mode is not the full physical-cell contract
const rawIsNotPhysical: TerminalCellPresentation = 'explicit';
// @ts-expect-error caller qualification is removed, not a compatibility alias
createMemoryTerminalHost({ cellPresentation: { qualification: 'existing' } });
// @ts-expect-error the reset-qualified route is removed too
createMemoryTerminalHost({ cellPresentation: { qualification: 'mode-8-reset' } });
// @ts-expect-error automatic admission uses only the capability policy
createMemoryTerminalHost({ cellPresentation: 'application-ordered' });
// @ts-expect-error derived full presentation cannot be supplied as raw initial state
createMemoryTerminalHost({ initialState: { cellPresentation: 'application-ordered' } });
// @ts-expect-error generic caller declarations are no longer operation assurance
const removedAssurance: TerminalOperationAssurance = 'declared';
// @ts-expect-error admission policy has no generic force/qualified mode
createMemoryTerminalHost({ capabilities: { cellPresentation: { policy: 'qualified' } } });
// @ts-expect-error exceptions address one concrete terminal condition
createMemoryTerminalHost({ capabilities: { cellPresentation: { exceptions: [{ condition: 'all', context: 'context' }] } } });
// @ts-expect-error each condition exception must be bound to an exact captured context
createMemoryTerminalHost({ capabilities: { cellPresentation: { exceptions: [{ condition: 'kitty-force-ltr' }] } } });
// @ts-expect-error the old qualification type is not exported as an alias
import type { TerminalCellPresentationQualification } from '@ismail-elkorchi/terminal-ui/host';
void automaticHost;
void strictHost;
void rawMode;
void physicalCells;
void assumedAssurance;
void removedAssurance;
void rawIsNotPhysical;

// @ts-expect-error full physical-cell proof is not a generic capability override
createMemoryTerminalHost({ capabilities: { overrides: { cellPresentation: true } } });
// @ts-expect-error a generic mode-support probe cannot establish the full invariant
createMemoryTerminalHost({ capabilities: { probes: { cellPresentation: 'supported' } } });
