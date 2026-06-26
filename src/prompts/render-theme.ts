import { defineTheme, renderStyledText } from '../theme/index.ts';
import { choiceStatusLines, promptLine } from './render-line.ts';
import type { TerminalCapabilities } from '../host/index.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptChoice } from './types.ts';
import type { PromptDefinition } from './types.ts';
import type { StyledText, TerminalTheme } from '../theme/index.ts';

export function renderPromptText<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  capabilities: TerminalCapabilities
): string {
  const theme = defineTheme(prompt.theme ?? {});
  if (prompt.kind === 'autocomplete') return renderAutocompletePrompt(prompt, state, theme, capabilities);
  return renderStyledText({ text: promptLine(prompt, state, theme) }, theme, capabilities);
}

function renderAutocompletePrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  theme: TerminalTheme,
  capabilities: TerminalCapabilities
): string {
  return [
    renderParts([{ text: `${prompt.label}: ${state.buffer.text}` }], theme, capabilities),
    ...choiceStatusLines(prompt, state, theme).map((line) => renderParts([{ text: line }], theme, capabilities)),
    ...state.choices.map((choice, index) => renderAutocompleteChoiceLine(choice, index, state, theme, capabilities))
  ].join('\n');
}

function renderAutocompleteChoiceLine(
  choice: PromptChoice<unknown>,
  index: number,
  state: PromptRuntimeState,
  theme: TerminalTheme,
  capabilities: TerminalCapabilities
): string {
  const pointer = index === state.focusedChoiceIndex ? theme.symbols.pointer : ' ';
  const suffix = choice.disabled === undefined || choice.disabled === false
    ? ''
    : ` (${choice.disabled === true ? 'disabled' : choice.disabled})`;
  const query = state.buffer.text;
  const parts: StyledText[] = [
    { text: `${pointer} ${theme.symbols.unselected} ` },
    highlightedField(choice.label, query),
    ...(choice.description === undefined ? [] : [
      { text: ' - ' },
      highlightedField(choice.description, query)
    ]),
    { text: suffix }
  ];
  return renderParts(parts, theme, capabilities);
}

function highlightedField(text: string, query: string): StyledText {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery.length > 0 && text.toLowerCase().includes(normalizedQuery);
  return matches ? { text, tone: 'accent', emphasis: 'underline' } : { text };
}

function renderParts(
  parts: readonly StyledText[],
  theme: TerminalTheme,
  capabilities: TerminalCapabilities
): string {
  return parts.map((part) => renderStyledText(part, theme, capabilities)).join('');
}
