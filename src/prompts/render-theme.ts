import { minimalTheme } from '../theme/index.ts';
import { serializeRenderSpans } from '../renderer/internal/ansi.ts';
import { choiceStatusLines, promptLine } from './render-line.ts';
import { matchCollectionQuery } from '../text/query.ts';
import type { TerminalCapabilityProfile } from '../host/index.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptChoice } from './types.ts';
import type { PromptDefinition } from './types.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderSpan } from '../visual/render.ts';

export function renderPromptText<TChoice>(
  prompt: PromptDefinition<TChoice>,
  state: PromptRuntimeState<TChoice>,
  capabilities: TerminalCapabilityProfile
): string {
  const theme = prompt.theme ?? minimalTheme;
  if (prompt.kind === 'autocomplete') return renderAutocompletePrompt(prompt, state, theme, capabilities);
  return renderParts([{ text: promptLine(prompt, state, theme) }], theme, capabilities);
}

function renderAutocompletePrompt<TValue>(
  prompt: Extract<PromptDefinition<TValue>, { readonly kind: 'autocomplete' }>,
  state: PromptRuntimeState<TValue>,
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile
): string {
  return [
    renderParts([{ text: `${prompt.label}: ${state.buffer.text}` }], theme, capabilities),
    ...choiceStatusLines(prompt, state, theme).map((line) => renderParts([{ text: line }], theme, capabilities)),
    ...state.choices.map((choice, index) => renderAutocompleteChoiceLine(choice, index, state, theme, capabilities))
  ].join('\n');
}

function renderAutocompleteChoiceLine<TValue>(
  choice: PromptChoice<TValue>,
  index: number,
  state: PromptRuntimeState<TValue>,
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile
): string {
  const pointer = index === state.focusedChoiceIndex ? theme.tokens.symbols.pointer : ' ';
  const suffix = choice.disabled === undefined || choice.disabled === false
    ? ''
    : ` (${choice.disabled === true ? 'disabled' : choice.disabled})`;
  const query = state.buffer.text;
  const parts: RenderSpan[] = [
    { text: `${pointer} ${theme.tokens.symbols.unselected} ` },
    highlightedField(choice.label, query),
    ...(choice.description === undefined ? [] : [
      { text: ' - ' },
      highlightedField(choice.description, query)
    ]),
    { text: suffix }
  ];
  return renderParts(parts, theme, capabilities);
}

function highlightedField(text: string, query: string): RenderSpan {
  const normalizedQuery = query.trim();
  const matches = normalizedQuery.length > 0 && matchCollectionQuery(
    { id: 'prompt-choice', primary: text },
    { text: normalizedQuery, mode: 'contains' },
  ) !== undefined;
  return matches
    ? { text, style: { fg: { kind: 'theme', token: 'command.match' }, underline: true } }
    : { text };
}

function renderParts(
  parts: readonly RenderSpan[],
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile
): string {
  return serializeRenderSpans(
    parts.map(defaultStyledSpan),
    { capabilities, theme }
  );
}

function defaultStyledSpan(part: RenderSpan): RenderSpan {
  if (part.style !== undefined) return part;
  return { ...part, style: { fg: { kind: 'theme', token: 'text.default' } } };
}
