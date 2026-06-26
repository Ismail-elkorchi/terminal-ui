import { diagnostic } from '../diagnostics.ts';
import { createInputDecoder } from '../input/index.ts';
import { handleShellInput } from './input.ts';
import { shellSnapshot } from './snapshot.ts';
import {
  cancelTransientLayer,
  filterSuggestions,
  historyState,
  initialState,
  paletteState,
  withTransientLayer
} from './state.ts';
import { submitInput } from './submit.ts';
import { createShellTranscriptRecorder } from './transcript.ts';
import { writePrompt } from './view.ts';
import type { TerminalHost } from '../host/index.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { ShellTranscriptRecorder } from './transcript.ts';
import type {
  ShellExit,
  ShellHistoryEntry,
  ShellOptions,
  ShellState,
  TerminalShell
} from './types.ts';

export function createShell(options: ShellOptions): TerminalShell {
  let state: ShellState = initialState(options);
  let history: readonly ShellHistoryEntry[] = [];
  let initialized = false;

  async function initialize(): Promise<void> {
    if (initialized) return;
    initialized = true;
    history = await options.history?.read() ?? [];
    const checkpoint = options.checkpoint?.enabled === true ? await options.checkpoint.read?.() : undefined;
    if (checkpoint !== undefined) {
      state = {
        ...state,
        input: { text: checkpoint.input, cursor: checkpoint.input.length },
        mode: checkpoint.input.length > 0 ? 'editing' : state.mode
      };
    }
  }

  async function persistCheckpoint(next: ShellState): Promise<void> {
    if (options.checkpoint?.enabled !== true) return;
    await options.checkpoint.write({ input: next.input.text, state: { mode: next.mode } });
  }

  async function setState(next: ShellState): Promise<ShellState> {
    state = next;
    await persistCheckpoint(state);
    return state;
  }

  const shell: TerminalShell = {
    id: options.id ?? 'terminal-shell',
    options,
    getState: () => state,
    async dispatch(event) {
      await initialize();
      switch (event.kind) {
        case 'input':
          return setState(withTransientLayer({
            ...state,
            input: { text: event.text, cursor: event.text.length },
            mode: event.text.length > 0 ? 'editing' : 'idle',
            suggestions: filterSuggestions(options, event.text)
          }, event.text.length > 0 ? { kind: 'suggestions', selectedIndex: 0 } : undefined));
        case 'submit':
          return submitInput(options, state, async (entry) => {
            history = [...history, entry];
            await options.history?.append(entry);
          }, setState);
        case 'history':
          return setState(historyState(state, history, event.direction));
        case 'palette':
          return setState(paletteState(options, state, event.action));
        case 'cancel':
          if (state.transientLayer !== undefined) {
            return setState(cancelTransientLayer(state));
          }
          return setState({ ...state, mode: 'cancelled' });
        case 'exit':
          return setState({ ...state, mode: 'exited' });
        case 'diagnostic':
          return setState({ ...state, diagnostics: [...state.diagnostics, event.diagnostic] });
      }
    },
    snapshot() {
      return shellSnapshot(shell.id, options, state);
    }
  };
  return shell;
}

export async function runShell(shell: TerminalShell, host?: TerminalHost): Promise<ShellExit> {
  if (host === undefined) {
    const diagnosticItem = diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Shell execution requires an explicit terminal host.');
    return {
      status: 'error',
      exitCode: 1,
      diagnostics: [diagnosticItem],
      snapshot: shell.snapshot()
    };
  }

  const capabilities = await host.getCapabilities();
  const nonTtyMode = capabilities.isTty ? undefined : shell.options.nonTty?.mode ?? 'transcript_only';
  const transcript = shell.options.transcript?.enabled === true || nonTtyMode === 'transcript_only'
    ? createShellTranscriptRecorder({ id: `${shell.id}-transcript` })
    : undefined;
  if (nonTtyMode === 'reject') {
    const diagnosticItem = diagnostic('PROMPT_NON_TTY_DENIED', 'Shell refused non-TTY input.', {
      ...(shell.options.nonTty?.diagnosticHint === undefined ? {} : { hint: shell.options.nonTty.diagnosticHint })
    });
    await shell.dispatch({ kind: 'diagnostic', diagnostic: diagnosticItem });
    return shellExit(shell, 'error', 1, transcript);
  }

  const session = capabilities.isTty ? await host.beginSession({ id: shell.id }) : undefined;
  const interactive = capabilities.isTty;
  try {
    if (interactive) await writePrompt(shell, host);
    const decoder = createInputDecoder();
    let buffer: TextEditBuffer = shell.getState().input;

    for await (const chunk of host.stdin.read()) {
      for (const event of decoder.decode(chunk)) {
        const result = await handleShellInput(shell, host, event, buffer, interactive);
        if (result.command !== undefined) transcript?.recordCommand(result.command);
        buffer = result.buffer;
        if (result.done) {
          await session?.restore(result.reason);
          return shellExit(shell, result.status, result.exitCode, transcript);
        }
      }
    }

    for (const event of decoder.flush()) {
      const result = await handleShellInput(shell, host, event, buffer, interactive);
      if (result.command !== undefined) transcript?.recordCommand(result.command);
      buffer = result.buffer;
      if (result.done) {
        await session?.restore(result.reason);
        return shellExit(shell, result.status, result.exitCode, transcript);
      }
    }

    await shell.dispatch({ kind: 'exit' });
    await session?.restore('success');
    return shellExit(shell, 'completed', 0, transcript);
  } catch (cause) {
    const diagnosticItem = diagnostic('SHELL_COMMAND_RUN_FAILED', 'Shell run failed before completion.', { cause });
    await shell.dispatch({ kind: 'diagnostic', diagnostic: diagnosticItem });
    await session?.restore('error');
    return shellExit(shell, 'error', 1, transcript);
  }
}

function shellExit(
  shell: TerminalShell,
  status: ShellExit['status'],
  exitCode: number,
  transcript: ShellTranscriptRecorder | undefined
): ShellExit {
  const snapshot = shell.snapshot();
  return {
    status,
    exitCode,
    diagnostics: shell.getState().diagnostics,
    snapshot,
    ...(transcript === undefined ? {} : { transcript: transcript.snapshot(shell.getState().diagnostics) })
  };
}
