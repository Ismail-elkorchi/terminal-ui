import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createTuiPreparedQuery, defineTui, measureElement, measuredColumn, richText, runTui, text, viewport } from '@ismail-elkorchi/terminal-ui';
import type { Element, TuiContext, TuiPreparedQueryMessage, TuiPreparedQueryState, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui';
import { acceptMeasurements, createMeasuredCollection, createMeasurementState, measurementRequests, measuredWindow, updateMeasurementState } from '@ismail-elkorchi/terminal-ui/collection';
import type { MeasurementState, MeasurementUpdate } from '@ismail-elkorchi/terminal-ui/collection';

type Entry = Element;
type Batch = readonly MeasurementUpdate<Entry>[];
interface State {
  readonly measurements: MeasurementState<Entry>;
  readonly preparation: TuiPreparedQueryState<Batch>;
}
type Message = { readonly kind: 'resize' | 'quit' }
  | { readonly kind: 'scroll'; readonly offset: number }
  | { readonly kind: 'measured'; readonly result: TuiPreparedQueryMessage<Batch> };

/** Exact measured content or explicit pending output; estimates never pretend to be accepted geometry. */
export function createMeasuredFeedApp(count = 10000) {
  const preparation = createTuiPreparedQuery<MeasurementState<Entry>, Batch, Message>({
    id: 'measure-visible-feed',
    toMessage: result => ({ kind: 'measured', result }),
    async prepare(state, context) {
      const updates: MeasurementUpdate<Entry>[] = [];
      for (const request of measurementRequests(state, 3)) {
        context.signal.throwIfAborted();
        // The component's own implementation measures it. Individual custom hooks remain synchronous.
        const rows = measureElement(request.value, request.geometry,
          { widthProfile: context.capabilities.unicode.widthProfile }).preferredHeight;
        updates.push({ request, rows });
        await context.clock.sleep(0, context.signal);
        context.signal.throwIfAborted();
      }
      return updates;
    },
  });
  const schedule = (state: State): TuiUpdateResult<State, Message> => {
    if (measurementRequests(state.measurements, 3).length === 0) {
      if (!state.preparation.pending) return { state };
      const result = preparation.cancel(state.preparation);
      return { ...result, state: { ...state, preparation: result.state } };
    }
    const result = preparation.request(state.preparation, state.measurements);
    return { ...result, state: { ...state, preparation: result.state } };
  };
  const dimensions = (context: TuiContext) => ({
    geometry: { ...context.terminalSize, revision: context.capabilities.unicode.widthProfile },
    viewportRows: context.terminalSize.rows,
  });
  return defineTui<State, Message>({
    id: 'measured-feed',
    init(context) {
      const collection = createMeasuredCollection(Array.from({ length: count }, (_, index) => ({
        id: String(index), rows: 2,
        value: richText({ id: `entry-${String(index)}`, segments: [{ kind: 'text',
          text: `Entry ${String(index)}: ${'Variable-height content. '.repeat(index % 8 + 1)}` }], wrap: true }),
      })));
      return schedule({ measurements: createMeasurementState({ collection, ...dimensions(context) }), preparation: preparation.init() });
    },
    resizeMessage: () => ({ kind: 'resize' }),
    inputBindings: [{ id: 'quit', label: 'Quit', phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }], message: { kind: 'quit' } }, {
      id: 'page-down', label: 'Next page', phase: 'beforeFocus', triggers: [{ kind: 'key', key: 'pageDown' }],
      toMessage: ({ state }) => ({ kind: 'scroll', offset: state.measurements.offsetRow + state.measurements.viewportRows }),
    }, {
      id: 'page-up', label: 'Previous page', phase: 'beforeFocus', triggers: [{ kind: 'key', key: 'pageUp' }],
      toMessage: ({ state }) => ({ kind: 'scroll', offset: Math.max(0, state.measurements.offsetRow - state.measurements.viewportRows) }),
    }],
    update(state, message, context) {
      if (message.kind === 'quit') return { state, exit: { reason: 'quit' } };
      if (message.kind === 'measured') {
        const result = preparation.update(state.preparation, message.result);
        if (result.state === state.preparation) return { state };
        const next = { ...state, preparation: result.state,
          measurements: message.result.kind === 'ready'
            ? acceptMeasurements(state.measurements, message.result.result) : state.measurements };
        return message.result.kind === 'failed' ? { state: next } : schedule(next);
      }
      return schedule({ ...state, measurements: updateMeasurementState(state.measurements, {
        collection: state.measurements.collection, ...dimensions(context),
        ...(message.kind === 'scroll' ? { offsetRow: message.offset, followTail: false } : {}),
      }) });
    },
    view(state) {
      if (state.preparation.error !== null) return text({ content: state.preparation.error.message });
      if (state.preparation.pending) return text({ content: 'Preparing visible rows…' });
      const window = measuredWindow(state.measurements.collection, state.measurements);
      return viewport(measuredColumn(window, entry => entry.item.value, {
        measurementRows: state.measurements.geometry.rows,
      }), {
        id: 'feed', offset: { row: state.measurements.offsetRow }, keyboardScroll: 'vertical',
        onScroll: request => ({ kind: 'scroll' as const, offset: request.nextState.offsetRow }),
      });
    },
  });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exit = await runTui(createMeasuredFeedApp());
  if (exit.status !== 'completed') process.exitCode = 1;
}
