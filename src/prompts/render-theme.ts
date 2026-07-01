import { defineTheme } from '../theme/index.ts';
import { serializeRenderSpans } from '../tui/ansi.ts';
import { choiceStatusLines, promptLine } from './render-line.ts';
import type { TerminalCapabilityProfile } from '../host/index.ts';
import type { PromptRuntimeState } from './state.ts';
import type { PromptChoice } from './types.ts';
import type { PromptDefinition } from './types.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { RenderSpan } from '../tui/render-primitives.ts';

export function renderPromptText<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  capabilities: TerminalCapabilityProfile
): string {
  const hasThemeOverride = prompt.theme !== undefined;
  const theme = defineTheme(prompt.theme ?? {});
  if (prompt.kind === 'autocomplete') return renderAutocompletePrompt(prompt, state, theme, capabilities, hasThemeOverride);
  return renderParts([{ text: promptLine(prompt, state, theme) }], theme, capabilities, hasThemeOverride);
}

function renderAutocompletePrompt<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptRuntimeState,
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile,
  useDefaultTextStyle: boolean
): string {
  return [
    renderParts([{ text: `${prompt.label}: ${state.buffer.text}` }], theme, capabilities, useDefaultTextStyle),
    ...choiceStatusLines(prompt, state, theme).map((line) => renderParts([{ text: line }], theme, capabilities, useDefaultTextStyle)),
    ...state.choices.map((choice, index) => renderAutocompleteChoiceLine(choice, index, state, theme, capabilities, useDefaultTextStyle))
  ].join('\n');
}

function renderAutocompleteChoiceLine(
  choice: PromptChoice<unknown>,
  index: number,
  state: PromptRuntimeState,
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile,
  useDefaultTextStyle: boolean
): string {
  const pointer = index === state.focusedChoiceIndex ? theme.symbols.pointer : ' ';
  const suffix = choice.disabled === undefined || choice.disabled === false
    ? ''
    : ` (${choice.disabled === true ? 'disabled' : choice.disabled})`;
  const query = state.buffer.text;
  const parts: RenderSpan[] = [
    { text: `${pointer} ${theme.symbols.unselected} ` },
    highlightedField(choice.label, query),
    ...(choice.description === undefined ? [] : [
      { text: ' - ' },
      highlightedField(choice.description, query)
    ]),
    { text: suffix }
  ];
  return renderParts(parts, theme, capabilities, useDefaultTextStyle);
}

function highlightedField(text: string, query: string): RenderSpan {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery.length > 0 && text.toLowerCase().includes(normalizedQuery);
  return matches
    ? { text, style: { fg: { kind: 'theme', token: 'menu.match' }, underline: true } }
    : { text };
}

function renderParts(
  parts: readonly RenderSpan[],
  theme: TerminalTheme,
  capabilities: TerminalCapabilityProfile,
  useDefaultTextStyle: boolean
): string {
  return serializeRenderSpans(
    useDefaultTextStyle ? parts.map(defaultStyledSpan) : parts,
    { capabilities, theme }
  );
}

function defaultStyledSpan(part: RenderSpan): RenderSpan {
  if (part.style !== undefined) return part;
  return { ...part, style: { fg: { kind: 'theme', token: 'text.default' } } };
}
