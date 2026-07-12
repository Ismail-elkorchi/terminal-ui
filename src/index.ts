export { terminalUiPackage } from './package.ts';
export type { RuntimeTarget, TerminalUiEntrypoint, TerminalUiPackage } from './package.ts';

export { diagnostic, terminalDiagnosticCodes } from './diagnostics.ts';
export type {
  TerminalDiagnostic,
  TerminalDiagnosticCode,
  TerminalDiagnosticValue,
  TerminalSeverity
} from './diagnostics.ts';
export { TerminalUiError } from './errors.ts';
export { err, ok } from './result.ts';
export type { Result } from './result.ts';

export { createTerminalHost } from './host/index.ts';
export type {
  CreateTerminalHostOptions,
  TerminalHost,
  TerminalViewport
} from './host/index.ts';

export { defineTui, runTui } from './tui/index.ts';
export type {
  TuiApp,
  TuiContext,
  TuiDefinition,
  TuiExit,
  TuiRunOptions,
  TuiUpdate,
  TuiUpdateResult,
  TuiView
} from './tui/index.ts';
