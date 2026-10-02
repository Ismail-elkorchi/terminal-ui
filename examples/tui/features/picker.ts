import { createTuiPreparedQuery, liftTuiResult, searchPicker, createSearchPickerKeymap } from '@ismail-elkorchi/terminal-ui';
import type { TuiChildDefinition, TuiPreparedQueryState, TuiPreparedQueryMessage, SearchPickerControlTransition, SearchEntry } from '@ismail-elkorchi/terminal-ui';
import { createSearchPickerState, createSearchPickerIndex, prepareSearchPickerIndex, prepareSearchPickerQuery, searchPickerReducer, searchPickerView, searchPickerEntryById, searchPickerQueryPosition } from '@ismail-elkorchi/terminal-ui/behavior';
import type { SearchPickerIndex, SearchPickerQueryResult, UnscrolledSearchPickerState } from '@ismail-elkorchi/terminal-ui/behavior';
import type { CollectionQuery } from '@ismail-elkorchi/terminal-ui/text';

/** Entry descriptors are immutable owned application input, including their keyword arrays. */
export type PickerSource<T> = SearchPickerIndex<T> | readonly SearchEntry<T>[];
export interface PickerState<T> extends TuiPreparedQueryState<SearchPickerQueryResult<T>> {
  readonly source: PickerSource<T>;
  readonly construction: TuiPreparedQueryState<SearchPickerIndex<T>>;
  readonly open: boolean;
  readonly control: UnscrolledSearchPickerState;
}
export type PickerMessage<T> =
  | { readonly kind: 'open' | 'close' }
  | { readonly kind: 'replace'; readonly source: PickerSource<T> }
  | { readonly kind: 'transition'; readonly transition: SearchPickerControlTransition }
  | { readonly kind: 'constructed'; readonly message: TuiPreparedQueryMessage<SearchPickerIndex<T>> }
  | { readonly kind: 'prepared'; readonly message: TuiPreparedQueryMessage<SearchPickerQueryResult<T>> }
  | { readonly kind: 'accept'; readonly id: string };

function isIndex<T>(source: PickerSource<T>): source is SearchPickerIndex<T> {
  return !Array.isArray(source);
}

/** Construction and querying have different dependencies but share the existing effect lifecycle. */
export function pickerDefinition<T>(source: PickerSource<T>, keymap: ReturnType<typeof createSearchPickerKeymap>): TuiChildDefinition<PickerState<T>, PickerMessage<T>, T> {
  const emptyIndex = createSearchPickerIndex<T>([]);
  const construction = createTuiPreparedQuery({
    id: 'source',
    prepare: (entries: readonly SearchEntry<T>[], context) => prepareSearchPickerIndex(entries, {
      signal: context.signal, yield: async () => { await context.clock.sleep(0, context.signal); },
    }),
    toMessage: (message): PickerMessage<T> => ({ kind: 'constructed', message }),
  });
  const query = createTuiPreparedQuery({
    id: 'search',
    prepare: ({ index, query }: { readonly index: SearchPickerIndex<T>; readonly query: CollectionQuery }, context) => prepareSearchPickerQuery(index, query, {
      signal: context.signal, yield: async () => { await context.clock.sleep(0, context.signal); },
    }),
    toMessage: (message): PickerMessage<T> => ({ kind: 'prepared', message }),
  });
  const request = (state: PickerState<T>) => {
    const index = state.construction.result;
    if (index === null) {
      if (state.construction.pending || isIndex(state.source)) return { state };
      return liftTuiResult(state, 'construction', construction.request(state.construction, state.source));
    }
    const view = searchPickerView(state.control);
    return query.request({ ...state, result: null }, { index, query: { text: view.input.text, ...view.query } });
  };
  return {
    init: () => ({ state: {
      ...query.init(), source, construction: { ...construction.init(), result: isIndex(source) ? source : null },
      open: false, control: createSearchPickerState({ query: { text: '', mode: 'contains' }, queryResult: null }, emptyIndex),
    } }),
    update(state, message) {
      const index = state.construction.result ?? emptyIndex;
      switch (message.kind) {
        case 'open': return request({ ...state, open: true });
        case 'close': {
          if (!state.open) return { state };
          const cancelled = query.cancel({ ...state, open: false });
          const stopped = construction.cancel(state.construction);
          return { ...cancelled, state: { ...cancelled.state, construction: stopped.state }, cancel: [...(cancelled.cancel ?? []), ...(stopped.cancel ?? [])] };
        }
        case 'replace': {
          if (message.source === state.source) return { state };
          const cancelled = query.cancel(state);
          const stopped = construction.cancel(state.construction);
          const next = { ...cancelled.state, source: message.source, result: null,
            construction: { ...stopped.state, result: isIndex(message.source) ? message.source : null } };
          const requested = state.open ? request(next) : { state: next };
          return { ...requested, cancel: [...(cancelled.cancel ?? []), ...(stopped.cancel ?? [])] };
        }
        case 'transition': {
          if (!state.open) return { state };
          const control = searchPickerReducer(state.control, message.transition, { searchPickerIndex: index, queryResult: state.result });
          if (control === state.control) return { state };
          const updated = { ...state, control };
          return control.editor.input.text !== state.control.editor.input.text || control.mode !== state.control.mode || control.caseSensitive !== state.control.caseSensitive
            ? request(updated) : { state: updated };
        }
        case 'constructed': {
          const built = construction.update(state.construction, message.message).state;
          if (built === state.construction) return { state };
          const next = { ...state, construction: built };
          return built.error === null && state.open ? request(next) : { state: next };
        }
        case 'prepared': {
          const settled = query.update(state, message.message).state;
          if (settled === state || settled.error !== null) return { state: settled };
          const id = settled.result?.entries.find(entry => !entry.disabled)?.id;
          const control = searchPickerReducer(settled.control, { kind: 'setActive', ...(id === undefined ? {} : { id }) }, { searchPickerIndex: index, queryResult: settled.result });
          return { state: { ...settled, control } };
        }
        case 'accept': {
          if (!state.open || state.pending || state.result === null || searchPickerQueryPosition(state.result, message.id) === undefined) return { state };
          const entry = searchPickerEntryById(index, message.id);
          return entry === undefined || entry.disabled ? { state } : { ...query.cancel({ ...state, open: false }), outputs: [entry.value] };
        }
      }
    },
    view: state => searchPicker<T, PickerMessage<T>, PickerMessage<T>>({
      id: 'picker', keymap, searchPickerIndex: state.construction.result ?? emptyIndex,
      queryResult: state.result, view: searchPickerView(state.control),
      meta: { accessibleName: 'Command search' }, onTransition: transition => ({ kind: 'transition', transition }),
      onAccept: event => ({ kind: 'accept', id: event.id }),
    }),
  };
}
