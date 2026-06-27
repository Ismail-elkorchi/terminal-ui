import { segmentGraphemes } from '../text/index.ts';
import { defaultTheme } from '../theme/index.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptChoice, PromptDefinition } from './types.ts';
import type { TerminalTheme } from '../theme/index.ts';

export function promptLine<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  theme: TerminalTheme = defaultTheme
): string {
  if (prompt.render !== undefined) return prompt.render.render(prompt);
  if (prompt.kind === 'confirm') return `${prompt.label}${confirmHint(prompt)} `;
  if (prompt.kind === 'select' || prompt.kind === 'multiselect' || prompt.kind === 'autocomplete') {
    return [
      prompt.kind === 'autocomplete' ? `${prompt.label}: ${state.buffer.text}` : `${prompt.label}:`,
      ...choiceStatusLines(prompt, state, theme),
      ...state.choices.map((choice, index) => choiceLine(prompt, state, choice, index, theme))
    ].join('\n');
  }
  if (prompt.kind === 'password') {
    return promptWithValidationStatus(`${prompt.label}: ${passwordMask(prompt, state.buffer.text)}`, state);
  }
  return promptWithValidationStatus(`${prompt.label}: ${state.buffer.text}`, state);
}

function promptWithValidationStatus(line: string, state: PromptRuntimeState): string {
  if (state.validationStatus === 'running') return `${line}\n  Validating...`;
  if (state.validationStatus === 'invalid' && state.validationDiagnostic !== undefined) {
    return `${line}\n! ${state.validationDiagnostic.message}`;
  }
  return line;
}

function passwordMask<TValue>(prompt: PromptDefinition<TValue>, value: string): string {
  return (prompt.mask ?? '*').repeat(segmentGraphemes(value).length);
}

function confirmHint<TValue>(prompt: PromptDefinition<TValue>): string {
  if (prompt.defaultValue === true) return ' [Y/n]';
  if (prompt.defaultValue === false) return ' [y/N]';
  return ' [y/n]';
}

function choiceLine<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  choice: PromptChoice<unknown>,
  index: number,
  theme: TerminalTheme
): string {
  const pointer = index === state.focusedChoiceIndex ? theme.symbols.pointer : ' ';
  const marker = prompt.kind === 'multiselect'
    ? (state.selectedChoiceIndexes.has(index) ? theme.symbols.checkboxChecked : theme.symbols.checkboxUnchecked)
    : theme.symbols.unselected;
  const suffix = choice.disabled === undefined || choice.disabled === false
    ? ''
    : ` (${choice.disabled === true ? 'disabled' : choice.disabled})`;
  const description = choice.description === undefined ? '' : ` - ${choice.description}`;
  return `${pointer} ${marker} ${choice.label}${description}${suffix}`;
}

export function choiceStatusLines<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  theme: TerminalTheme
): readonly string[] {
  if (prompt.kind !== 'select' && prompt.kind !== 'multiselect' && prompt.kind !== 'autocomplete') return [];
  if (state.choiceDiagnostics.length > 0) {
    return state.choiceDiagnostics.map((item) => `${theme.symbols.statusError} ${item.message}`);
  }
  if (state.choiceLoading) return ['  Loading...'];
  if (state.choices.length === 0) return [prompt.kind === 'autocomplete' ? '  No matches' : '  No choices'];
  if (state.choiceHasMore) return [`  More choices available${choiceTotalSuffix(state)}. Press PageDown.`];
  return [];
}

function choiceTotalSuffix(state: PromptRuntimeState): string {
  if (state.choiceTotal === undefined) return '';
  return ` (${String(state.choices.length)}/${String(state.choiceTotal)})`;
}
