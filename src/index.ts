
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

export { copySelectedTextToClipboard, defineTui, runTui } from './tui/index.ts';
export { resolveSelectedText } from './interaction/index.ts';
export type {
  CopySelectedTextInput,
  CopySelectedTextResult,
  TuiApp,
  TuiContext,
  TuiDefinition,
  TuiExit,
  TuiRunOptions,
  TuiUpdate,
  TuiUpdateResult,
  TuiView
} from './tui/index.ts';
export type {
  ResolveSelectedTextInput,
  ResolveSelectedTextResult,
  SelectableTextSource,
  SelectionInteractionMode
} from './interaction/index.ts';
