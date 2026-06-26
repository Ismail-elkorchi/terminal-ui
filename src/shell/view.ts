import { defineTheme, renderStyledText } from '../theme/index.ts';
import type { TerminalHost } from '../host/index.ts';
import type { ShellState, ShellSuggestion, TerminalShell } from './types.ts';
import type { TerminalTheme } from '../theme/index.ts';

export async function writePrompt(shell: TerminalShell, host: TerminalHost): Promise<void> {
  await host.write({ text: await promptText(shell, host) });
}

export async function rewriteLine(shell: TerminalShell, host: TerminalHost): Promise<void> {
  await host.write({ text: `\r\u001B[2K${await promptText(shell, host)}` });
}

async function promptText(shell: TerminalShell, host: TerminalHost): Promise<string> {
  const theme = defineTheme(shell.options.theme ?? {});
  const capabilities = await host.getCapabilities();
  return renderStyledText({ text: promptPlainText(shell, theme) }, theme, capabilities);
}

function promptPlainText(shell: TerminalShell, theme: TerminalTheme): string {
  const prompt = shell.options.prompt;
  const prefix = typeof prompt === 'function' ? prompt(shell.getState()) : prompt ?? '> ';
  const state = shell.getState();
  const overlay = shellOverlayText(state, theme);
  return `${prefix}${state.input.text}${overlay.length === 0 ? '' : `\n${overlay}`}`;
}

function shellOverlayText(state: ShellState, theme: TerminalTheme): string {
  const layer = state.transientLayer;
  if (layer === undefined) return '';
  if (layer.kind === 'help') {
    const preview = layer.preview;
    return [
      preview.title,
      preview.description,
      preview.usage === undefined ? undefined : `usage: ${preview.usage}`,
      preview.aliases === undefined || preview.aliases.length === 0 ? undefined : `aliases: ${preview.aliases.join(', ')}`,
      preview.help
    ].filter((line): line is string => line !== undefined && line.length > 0).join('\n');
  }
  return state.suggestions
    .map((suggestion, index) => `${index === layer.selectedIndex ? theme.symbols.pointer : theme.symbols.unselected} ${suggestionLine(suggestion)}`)
    .join('\n');
}

function suggestionLine(suggestion: ShellSuggestion): string {
  return suggestion.description === undefined
    ? suggestion.label
    : `${suggestion.label} - ${suggestion.description}`;
}
