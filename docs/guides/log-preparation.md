# Prepared log views

A `LogViewerView` is one immutable accepted result containing query matches and,
for wrapped output, row geometry. Navigation and rendering consume the same
result. In particular, folding does not leave the reducer navigating matches
that the displayed log cannot show.

`prepareLogViewerView(input, context)` performs query and wrapped-width work
cooperatively. Run it through the existing `createTuiPreparedQuery` effect
lifecycle. Pass the resulting `view` to the component and reducer. A stale result
or `null` never triggers synchronous query or whole-history wrapping in live
rendering. A wrapped log displays “Preparing log layout…” until matching geometry
is ready; unwrapped rows remain visible with search marked pending.

## One preparation lifetime

The component's `onLayout` callback supplies a `LogViewerViewInput` from the
accepted frame, including actual allocated width and text-width profile when
wrapping. It fires when the requested source, query, folds or geometry changes
and the supplied view does not match. Receiving the result does not cause a
feedback loop. This is post-commit feedback, not a callback from measurement or
painting, and synchronous standalone rendering does not invoke it.

```ts
import {
  prepareLogViewerView,
  type LogViewerView,
  type LogViewerViewInput,
} from '@ismail-elkorchi/terminal-ui/behavior';
import {
  createTuiPreparedQuery,
  type TuiPreparedQueryMessage,
  type TuiPreparedQueryState,
} from '@ismail-elkorchi/terminal-ui/tui';

interface State extends TuiPreparedQueryState<LogViewerView> {
  readonly query: string;
}
type Message =
  | { readonly kind: 'prepare'; readonly input: LogViewerViewInput }
  | { readonly kind: 'prepared'; readonly result: TuiPreparedQueryMessage<LogViewerView> }
  | { readonly kind: 'query'; readonly text: string };

const prepared = createTuiPreparedQuery({
  id: 'log-view',
  prepare: (input: LogViewerViewInput, context) => prepareLogViewerView(input, {
    signal: context.signal,
    yield: async () => { await context.clock.sleep(0, context.signal); },
  }),
  toMessage: (result): Message => ({ kind: 'prepared', result }),
});

// init: { state: { ...prepared.init(), query: '' } }
// update:
//   prepare  -> prepared.request(state, message.input)
//   prepared -> prepared.update(state, message.result)
//   query    -> { state: { ...state, query: message.text } }
// view:
//   logViewer({ history, query: { text: state.query }, wrap: true,
//     id: 'log', view: state.result,
//     onLayout: (input): Message => ({ kind: 'prepare', input }) })
```

Forward the full query result, including effects and cancellation, through the
parent update. Call `prepared.cancel` when closing a feature that should stop
work, or use scoped child ownership when removing it. The displayed view retains
one accepted projection; there is no independent query/geometry controller to
coordinate. Resizing reuses retained matches, and unchanged history segments
reuse width/fold geometry. The projection prepares both the allocated width and
the one-column-narrower width used when a scrollbar appears.

For interactive navigation, pass the same `view: state.result` to
`logViewerReducer`, along with the current `history`. Query and folding edits
remain application state transitions; `onLayout` requests their new projection.
Selection, follow-tail policy, retry and whether to retain old results remain
application decisions.

The supplied reducer clears the active search occurrence when query or folding
changes invalidate its search domain. No-op transitions preserve it, and text
selection and follow-tail state are preserved across folding edits.

## Explicit synchronous work

`createLogViewerView(input)` deliberately prepares synchronously for small fixed
data or snapshot rendering. For a wrapped snapshot, provide `wrap: true`, the
allocated `width`, and its `widthProfile`. Its frame must use the matching width
and profile. A plain unwrapped log without search can pass `view: null` directly.
Do not put synchronous preparation in a live view/update and expect cooperative
input handling.

Source creation/sanitization, input normalization, individual-record searching
and wrapping, and visible-record painting remain synchronous. Query preparation
yields between bounded batches of records or collected matches, after each
individual record's search has completed. Geometry yields within cold segments
and between assembled segments, including cache hits. Preparation removes
whole-history query and cold-width wrapping from the serialized frame path; it
is not an off-thread renderer or a hard latency bound for arbitrarily large
single records.

The runtime regressions exercise 6,000-entry search replacement and a wrapped
20,000-entry application with paused cold preparation, newer queries, actual
Escape input, resize, close/reopen, stale completions and redraw feedback.
