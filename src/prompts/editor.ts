import { diagnostic } from '../diagnostics.ts';
import { createPromptSnapshot } from './snapshot.ts';
import { submitPrompt } from './submit.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type {
  PromptDefinition,
  PromptEditorCommand,
  PromptEditorResult,
  PromptResult
} from './types.ts';

export async function runEditorPrompt(
  prompt: PromptDefinition<string>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined
): Promise<PromptResult<string>> {
  if (prompt.nonTty?.mode === 'provided_value' && 'value' in prompt.nonTty) {
    return submitPrompt(prompt, prompt.nonTty.value, snapshot, host);
  }

  const adapter = prompt.editorAdapter;
  if (adapter === undefined) {
    return editorAbort(prompt, snapshot, editorUnavailableMessage(prompt));
  }

  const command = resolveEditorCommand(prompt, host);
  if (command === undefined) {
    return editorAbort(
      prompt,
      snapshot,
      'Editor prompt requires editorCommand, VISUAL, or EDITOR before the editor adapter can run.'
    );
  }

  const controller = new AbortController();
  const editorRun = adapter.edit({
    prompt,
    initialValue: typeof prompt.defaultValue === 'string' ? prompt.defaultValue : '',
    command,
    ...(host === undefined ? {} : { host }),
    signal: controller.signal
  });
  const result = await raceEditorResult(prompt, host, editorRun, controller);
  return editorResultToPromptResult(prompt, snapshot, host, result);
}

function resolveEditorCommand(
  prompt: PromptDefinition<string>,
  host: TerminalHost | undefined
): PromptEditorCommand | undefined {
  if (prompt.editorCommand !== undefined && prompt.editorCommand.length > 0) {
    return { source: 'option', argv: prompt.editorCommand };
  }
  const visual = normalizedEnvCommand(host, 'VISUAL');
  if (visual !== undefined) return { source: 'VISUAL', argv: [visual] };
  const editor = normalizedEnvCommand(host, 'EDITOR');
  if (editor !== undefined) return { source: 'EDITOR', argv: [editor] };
  return undefined;
}

async function raceEditorResult(
  prompt: PromptDefinition<string>,
  host: TerminalHost | undefined,
  editorRun: Promise<PromptEditorResult>,
  controller: AbortController
): Promise<PromptEditorResult> {
  if (prompt.timeoutMs === undefined || host === undefined) return editorRun;
  const timeoutMs = prompt.timeoutMs;
  const timeout = host.clock.sleep(timeoutMs, controller.signal).then(
    (): PromptEditorResult => ({
      status: 'failed',
      diagnostics: [
        diagnostic('INPUT_TIMEOUT', 'Editor prompt timed out before the editor adapter returned.', {
          target: prompt.id ?? prompt.kind,
          data: { timeoutMs }
        })
      ]
    })
  );
  const result = await Promise.race([editorRun, timeout]);
  controller.abort();
  return result;
}

async function editorResultToPromptResult(
  prompt: PromptDefinition<string>,
  snapshot: AccessibleSnapshot,
  host: TerminalHost | undefined,
  result: PromptEditorResult
): Promise<PromptResult<string>> {
  switch (result.status) {
    case 'submitted': {
      const submitted = await submitPrompt(prompt, result.value, createPromptSnapshot(prompt, result.value), host);
      return withDiagnostics(submitted, result.diagnostics ?? []);
    }
    case 'cancelled':
      return editorAbort(prompt, snapshot, 'Editor prompt was cancelled.', result.diagnostics, 'cancelled');
    case 'interrupted':
      return editorAbort(prompt, snapshot, 'Editor prompt was interrupted.', result.diagnostics, 'interrupted');
    case 'unavailable':
      return editorAbort(prompt, snapshot, 'Editor adapter reported that no editor is available.', result.diagnostics);
    case 'failed':
      return editorAbort(prompt, snapshot, 'Editor adapter failed before producing a value.', result.diagnostics);
  }
}

function editorAbort(
  prompt: PromptDefinition<string>,
  snapshot: AccessibleSnapshot,
  message: string,
  diagnostics: readonly TerminalDiagnostic[] = [],
  reason: 'cancelled' | 'interrupted' | 'host_error' = 'host_error'
): PromptResult<string> {
  return {
    schemaVersion: 'terminal-ui.prompt-result.v1',
    status: 'aborted',
    reason,
    diagnostics: [
      diagnostic('PROMPT_EDITOR_UNAVAILABLE', message, { target: prompt.id ?? prompt.kind }),
      ...diagnostics
    ],
    snapshot
  };
}

function withDiagnostics(
  result: PromptResult<string>,
  diagnostics: readonly TerminalDiagnostic[]
): PromptResult<string> {
  if (diagnostics.length === 0) return result;
  return { ...result, diagnostics: [...result.diagnostics, ...diagnostics] };
}

function editorUnavailableMessage(prompt: PromptDefinition<string>): string {
  if (prompt.editorCommand !== undefined && prompt.editorCommand.length > 0) {
    return 'Editor prompt has an editor command, but no editor adapter is available.';
  }
  return 'Editor prompt requires an editor adapter plus editorCommand, VISUAL, EDITOR, or a provided non-TTY value.';
}

function normalizedEnvCommand(host: TerminalHost | undefined, name: 'VISUAL' | 'EDITOR'): string | undefined {
  const value = host?.env.get(name)?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}
