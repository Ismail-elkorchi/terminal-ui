import { isCancelKey, isInterruptKey } from '../input/index.ts';
import { editTextBuffer } from '../text/index.ts';
import { isPaletteNavigation } from './state.ts';
import { rewriteLine, writePrompt } from './view.ts';
import type { TerminalHost } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { TextEditBuffer } from '../text/index.ts';
import type { ShellExit, ShellTranscriptCommand, TerminalShell } from './types.ts';

export interface ShellInputResult {
  readonly buffer: TextEditBuffer;
  readonly done: boolean;
  readonly status: ShellExit['status'];
  readonly exitCode: number;
  readonly reason: 'success' | 'cancelled' | 'interrupted' | 'error';
  readonly command?: ShellTranscriptCommand;
}

export async function handleShellInput(
  shell: TerminalShell,
  host: TerminalHost,
  event: InputEvent,
  buffer: TextEditBuffer,
  interactive: boolean
): Promise<ShellInputResult> {
  if (isInterruptKey(event)) {
    await shell.dispatch({ kind: 'cancel' });
    return { buffer, done: true, status: 'interrupted', exitCode: 130, reason: 'interrupted' };
  }
  if (isCancelKey(event)) {
    const next = await shell.dispatch({ kind: 'cancel' });
    return next.mode === 'cancelled'
      ? { buffer: next.input, done: true, status: 'cancelled', exitCode: 130, reason: 'cancelled' }
      : { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
  }
  if (event.kind === 'key' && event.key === 'ctrlD' && buffer.text.length === 0) {
    await shell.dispatch({ kind: 'exit' });
    return { buffer, done: true, status: 'completed', exitCode: 0, reason: 'success' };
  }
  if (event.kind === 'key' && event.key === 'tab') {
    const action = shell.getState().transientLayer === undefined ? 'open' : 'accept';
    const next = await shell.dispatch({ kind: 'palette', action });
    if (interactive) await rewriteLine(shell, host);
    return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
  }
  if (event.kind === 'text' && event.text === '?' && shell.getState().transientLayer !== undefined) {
    const next = await shell.dispatch({ kind: 'palette', action: 'help' });
    if (interactive) await rewriteLine(shell, host);
    return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
  }
  if (event.kind === 'key' && event.key === 'enter') {
    if (buffer.text.length === 0 && shell.getState().transientLayer?.kind === 'palette') {
      const next = await shell.dispatch({ kind: 'palette', action: 'accept' });
      if (interactive) await rewriteLine(shell, host);
      return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
    }
    if (interactive) await host.write({ text: '\n' });
    await shell.dispatch({ kind: 'input', text: buffer.text });
    const next = await shell.dispatch({ kind: 'submit' });
    if (next.mode === 'cancelled') {
      return { buffer: next.input, done: true, status: 'cancelled', exitCode: 130, reason: 'cancelled' };
    }
    if (next.mode === 'exited') {
      return { buffer: next.input, done: true, status: 'completed', exitCode: 0, reason: 'success' };
    }
    if (interactive) await writePrompt(shell, host);
    return {
      buffer: next.input,
      done: false,
      status: 'completed',
      exitCode: 0,
      reason: 'success',
      ...(next.lastCommand === undefined ? {} : { command: next.lastCommand })
    };
  }
  if (event.kind === 'key' && event.key === 'arrowUp') {
    if (isPaletteNavigation(shell.getState())) {
      const next = await shell.dispatch({ kind: 'palette', action: 'previous' });
      if (interactive) await rewriteLine(shell, host);
      return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
    }
    const next = await shell.dispatch({ kind: 'history', direction: 'previous' });
    if (interactive) await rewriteLine(shell, host);
    return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
  }
  if (event.kind === 'key' && event.key === 'arrowDown') {
    if (isPaletteNavigation(shell.getState())) {
      const next = await shell.dispatch({ kind: 'palette', action: 'next' });
      if (interactive) await rewriteLine(shell, host);
      return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
    }
    const next = await shell.dispatch({ kind: 'history', direction: 'next' });
    if (interactive) await rewriteLine(shell, host);
    return { buffer: next.input, done: false, status: 'completed', exitCode: 0, reason: 'success' };
  }
  const edited = editBufferForEvent(buffer, event);
  if (edited !== buffer) {
    await shell.dispatch({ kind: 'input', text: edited.text });
    if (interactive) await rewriteLine(shell, host);
    return { buffer: edited, done: false, status: 'completed', exitCode: 0, reason: 'success' };
  }
  return { buffer, done: false, status: 'completed', exitCode: 0, reason: 'success' };
}

function editBufferForEvent(buffer: TextEditBuffer, event: InputEvent): TextEditBuffer {
  if (event.kind === 'text') return editTextBuffer(buffer, { kind: 'insert', text: event.text });
  if (event.kind === 'paste') return editTextBuffer(buffer, { kind: 'insert', text: event.text });
  if (event.kind !== 'key') return buffer;
  switch (event.key) {
    case 'backspace':
      return editTextBuffer(buffer, { kind: 'deleteBackward' });
    case 'delete':
      return editTextBuffer(buffer, { kind: 'deleteForward' });
    case 'arrowLeft':
      return editTextBuffer(buffer, { kind: 'moveLeft' });
    case 'arrowRight':
      return editTextBuffer(buffer, { kind: 'moveRight' });
    case 'home':
      return editTextBuffer(buffer, { kind: 'moveHome' });
    case 'end':
      return editTextBuffer(buffer, { kind: 'moveEnd' });
    case 'space':
      return editTextBuffer(buffer, { kind: 'insert', text: ' ' });
    default:
      return buffer;
  }
}
