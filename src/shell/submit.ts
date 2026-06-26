import {
  adapterForSource,
  parseDiagnostics,
  parseStageDiagnostics,
  runDiagnostics,
  runStageDiagnostics,
  shellParseFailure,
  validationDiagnostics,
  validationStageDiagnostics
} from './adapter.ts';
import { redactShellCommandDiagnostics } from './redact.ts';
import { clearLastCommand, withoutTransientLayer } from './state.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { ShellHistoryEntry, ShellOptions, ShellState, ShellTranscriptCommand } from './types.ts';

export async function submitInput(
  options: ShellOptions,
  current: ShellState,
  appendHistory: (entry: ShellHistoryEntry) => Promise<void>,
  setState: (state: ShellState) => Promise<ShellState>
): Promise<ShellState> {
  const input = current.input.text.trim();
  if (input.length === 0) {
    return setState(clearLastCommand(withoutTransientLayer({ ...current, input: { text: '', cursor: 0 }, mode: 'idle' })));
  }
  await appendHistory({ input });

  const adapter = adapterForSource(options.commands);
  if (adapter === undefined) {
    const command: ShellTranscriptCommand = {
      input,
      status: 'failed',
      exitCode: 1,
      diagnostics: [shellParseFailure('Shell commands require a cli-core adapter.')]
    };
    return setState({
      ...withoutTransientLayer(current),
      mode: 'idle',
      input: { text: '', cursor: 0 },
      diagnostics: [...current.diagnostics, ...command.diagnostics],
      lastCommand: command
    });
  }

  const running = await setState(withoutTransientLayer({ ...current, mode: 'running' }));
  const parsed = adapter.parse({ input });
  if (!parsed.ok) {
    const diagnostics = redactShellCommandDiagnostics(input, undefined, [parsed.error, ...(parsed.diagnostics ?? [])]);
    return setState({
      ...running,
      mode: 'idle',
      input: { text: '', cursor: 0 },
      diagnostics: [...running.diagnostics, ...diagnostics],
      lastCommand: {
        input,
        status: 'failed',
        exitCode: 1,
        diagnostics
      }
    });
  }

  const invocation = parsed.value;
  if (!invocation.ok) {
    const diagnostics = redactShellCommandDiagnostics(input, invocation.argv, parseDiagnostics(invocation));
    return setState({
      ...running,
      mode: 'idle',
      input: { text: '', cursor: 0 },
      diagnostics: [...running.diagnostics, ...diagnostics],
      lastCommand: {
        input,
        argv: invocation.argv,
        status: 'failed',
        exitCode: 1,
        diagnostics
      }
    });
  }

  const parseWarnings = redactShellCommandDiagnostics(input, invocation.argv, parseStageDiagnostics(invocation));
  const validation = await adapter.validate?.(invocation);
  if (validation?.ok === false) {
    const diagnostics = redactShellCommandDiagnostics(input, invocation.argv, [
      ...parseWarnings,
      ...validationDiagnostics(validation)
    ]);
    return setState({
      ...running,
      mode: 'idle',
      input: { text: '', cursor: 0 },
      diagnostics: [...running.diagnostics, ...diagnostics],
      lastCommand: {
        input,
        argv: invocation.argv,
        status: 'failed',
        exitCode: 1,
        diagnostics
      }
    });
  }

  const commandDiagnostics = [
    ...parseWarnings,
    ...(validation === undefined
      ? []
      : redactShellCommandDiagnostics(input, invocation.argv, validationStageDiagnostics(validation)))
  ];
  if (options.runPolicy?.allowRun === false || adapter.run === undefined) {
    return setState({
      ...running,
      mode: 'idle',
      input: { text: '', cursor: 0 },
      diagnostics: appendDiagnostics(running.diagnostics, commandDiagnostics),
      lastCommand: {
        input,
        argv: invocation.argv,
        status: 'skipped',
        diagnostics: commandDiagnostics
      }
    });
  }

  const run = await adapter.run({ input, invocation, ...(validation === undefined ? {} : { validation }) });
  const failed = !run.ok || run.exitStatus !== 0;
  const diagnostics = [
    ...commandDiagnostics,
    ...redactShellCommandDiagnostics(input, invocation.argv, failed ? runDiagnostics(run) : runStageDiagnostics(run))
  ];
  return setState({
    ...running,
    mode: 'idle',
    input: { text: '', cursor: 0 },
    diagnostics: appendDiagnostics(running.diagnostics, diagnostics),
    lastCommand: {
      input,
      argv: invocation.argv,
      status: failed ? 'failed' : 'completed',
      exitCode: run.exitStatus,
      diagnostics
    }
  });
}

function appendDiagnostics(
  current: readonly TerminalDiagnostic[],
  next: readonly TerminalDiagnostic[]
): readonly TerminalDiagnostic[] {
  return next.length === 0 ? current : [...current, ...next];
}
