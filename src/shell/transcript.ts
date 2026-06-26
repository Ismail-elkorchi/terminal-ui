import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { ShellTranscript, ShellTranscriptCommand } from './types.ts';
import { redactShellDiagnostics, redactShellTranscriptCommand, sensitiveShellValuesFromCommand } from './redact.ts';

export interface ShellTranscriptRecorderOptions {
  readonly id?: string;
  readonly startedAt?: string;
}

export interface ShellTranscriptRecorder {
  recordCommand(command: ShellTranscriptCommand): void;
  snapshot(diagnostics?: readonly TerminalDiagnostic[]): ShellTranscript;
}

export function createShellTranscriptRecorder(options: ShellTranscriptRecorderOptions = {}): ShellTranscriptRecorder {
  const commands: ShellTranscriptCommand[] = [];
  const secrets = new Set<string>();
  return {
    recordCommand(command) {
      for (const secret of sensitiveShellValuesFromCommand(command)) {
        secrets.add(secret);
      }
      commands.push(redactShellTranscriptCommand(command));
    },
    snapshot(diagnostics = []) {
      return {
        schemaVersion: 'terminal-ui.shell-transcript.v1',
        id: options.id ?? 'shell-transcript',
        startedAt: options.startedAt ?? new Date(0).toISOString(),
        commands: [...commands],
        diagnostics: redactShellDiagnostics(diagnostics, [...secrets])
      };
    }
  };
}
