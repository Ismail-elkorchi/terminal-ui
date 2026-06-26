import { suggestionsForSource } from './adapter.ts';
import type {
  ShellHelpPreview,
  ShellHistoryEntry,
  ShellOptions,
  ShellState,
  ShellSuggestion
} from './types.ts';

export function withoutTransientLayer(state: ShellState): ShellState {
  return {
    input: state.input,
    mode: state.mode,
    suggestions: state.suggestions,
    diagnostics: state.diagnostics,
    ...(state.historyCursor === undefined ? {} : { historyCursor: state.historyCursor }),
    ...(state.lastCommand === undefined ? {} : { lastCommand: state.lastCommand })
  };
}

export function withTransientLayer(state: ShellState, transientLayer: ShellState['transientLayer']): ShellState {
  if (transientLayer === undefined) return withoutTransientLayer(state);
  return { ...state, transientLayer };
}

export function clearLastCommand(state: ShellState): ShellState {
  return {
    input: state.input,
    mode: state.mode,
    suggestions: state.suggestions,
    diagnostics: state.diagnostics,
    ...(state.historyCursor === undefined ? {} : { historyCursor: state.historyCursor }),
    ...(state.transientLayer === undefined ? {} : { transientLayer: state.transientLayer })
  };
}

export function initialState(options: ShellOptions): ShellState {
  return {
    input: { text: '', cursor: 0 },
    mode: 'idle',
    suggestions: suggestionsForSource(options.commands),
    diagnostics: []
  };
}

export function historyState(
  state: ShellState,
  history: readonly ShellHistoryEntry[],
  direction: 'previous' | 'next'
): ShellState {
  if (history.length === 0) return state;
  const currentCursor = state.historyCursor ?? history.length;
  const nextCursor = direction === 'previous'
    ? Math.max(0, currentCursor - 1)
    : Math.min(history.length, currentCursor + 1);
  const entry = history[nextCursor];
  const input = entry?.input ?? '';
  return {
    ...state,
    input: { text: input, cursor: input.length },
    historyCursor: nextCursor,
    mode: input.length > 0 ? 'editing' : 'idle'
  };
}

export function paletteState(options: ShellOptions, state: ShellState, action: ShellPaletteAction): ShellState {
  const allSuggestions = suggestionsForSource(options.commands);
  const suggestions = state.transientLayer?.kind === 'palette' || state.transientLayer?.kind === 'help'
    ? allSuggestions
    : state.suggestions.length === 0 ? allSuggestions : state.suggestions;
  const selectedIndex = normalizedSelectedIndex(state.transientLayer?.selectedIndex ?? 0, suggestions.length);
  switch (action) {
    case 'open':
      return withTransientLayer({
        ...state,
        mode: 'suggesting',
        suggestions: allSuggestions
      }, { kind: 'palette', selectedIndex: 0 });
    case 'close':
      return withoutTransientLayer({ ...state, mode: state.input.text.length > 0 ? 'editing' : 'idle' });
    case 'next':
      return withTransientLayer({
        ...state,
        mode: 'suggesting',
        suggestions
      }, {
        kind: state.transientLayer?.kind === 'suggestions' ? 'suggestions' : 'palette',
        selectedIndex: normalizedSelectedIndex(selectedIndex + 1, suggestions.length)
      });
    case 'previous':
      return withTransientLayer({
        ...state,
        mode: 'suggesting',
        suggestions
      }, {
        kind: state.transientLayer?.kind === 'suggestions' ? 'suggestions' : 'palette',
        selectedIndex: normalizedSelectedIndex(selectedIndex - 1, suggestions.length)
      });
    case 'accept': {
      const selected = suggestions[selectedIndex];
      if (selected === undefined) return withoutTransientLayer({ ...state, mode: 'idle' });
      return withoutTransientLayer({
        ...state,
        input: { text: selected.label, cursor: selected.label.length },
        mode: 'editing',
        suggestions: filterSuggestions(options, selected.label)
      });
    }
    case 'help': {
      const selected = suggestions[selectedIndex];
      if (selected === undefined) return state;
      const returnTo = state.transientLayer?.kind === 'suggestions' ? 'suggestions' : 'palette';
      return withTransientLayer({
        ...state,
        mode: 'suggesting',
        suggestions
      }, {
        kind: 'help',
        selectedIndex,
        returnTo,
        preview: helpPreviewForSuggestion(selected)
      });
    }
  }
}

export function cancelTransientLayer(state: ShellState): ShellState {
  const layer = state.transientLayer;
  if (layer?.kind === 'help') {
    return withTransientLayer({
      ...state,
      mode: 'suggesting'
    }, { kind: layer.returnTo, selectedIndex: layer.selectedIndex });
  }
  return withoutTransientLayer({
    ...state,
    mode: state.input.text.length > 0 ? 'editing' : 'idle'
  });
}

export function filterSuggestions(options: ShellOptions, query: string): readonly ShellSuggestion[] {
  const suggestions = suggestionsForSource(options.commands);
  if (query.trim().length === 0) return suggestions;
  const normalized = query.trim().toLowerCase();
  return suggestions.filter((suggestion) => suggestionSearchText(suggestion).includes(normalized));
}

export function isPaletteNavigation(state: ShellState): boolean {
  const kind = state.transientLayer?.kind;
  return kind === 'palette' || kind === 'suggestions';
}

type ShellPaletteAction = 'open' | 'close' | 'next' | 'previous' | 'accept' | 'help';

function normalizedSelectedIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + count) % count;
}

function helpPreviewForSuggestion(suggestion: ShellSuggestion): ShellHelpPreview {
  return {
    title: suggestion.label,
    ...(suggestion.description === undefined ? {} : { description: suggestion.description }),
    ...(suggestion.usage === undefined ? {} : { usage: suggestion.usage }),
    ...(suggestion.aliases === undefined || suggestion.aliases.length === 0 ? {} : { aliases: suggestion.aliases }),
    ...(suggestion.help === undefined ? {} : { help: suggestion.help })
  };
}

function suggestionSearchText(suggestion: ShellSuggestion): string {
  return [
    suggestion.label,
    suggestion.description,
    suggestion.usage,
    suggestion.help,
    ...(suggestion.aliases ?? [])
  ].filter((value): value is string => value !== undefined).join(' ').toLowerCase();
}
