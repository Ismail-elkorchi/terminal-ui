import { prepareWork, type CooperativeWorkContext } from '../../foundation/cooperative-work.ts';
import { textDocumentLineBoundaries, textDocumentLineEvents } from '../../text/document.ts';
import { sanitizeTerminalTextWork } from '../../text/sanitize.ts';
import { measureTextAreaWork, textAreaGeometryWork, textAreaRowOffsetMapWork } from './geometry.ts';
import { createTextAreaModel } from './model.ts';
import { assertTextAreaRequestDependencies, readTextAreaLayoutRequest, retainPreparedTextAreaLayout } from './prepared-layout.ts';
import type { PreparedTextAreaLayout, TextAreaLayoutRequest } from './contracts.ts';

export type { PreparedTextAreaLayout, TextAreaLayoutRequest } from './contracts.ts';

/** Complete actual measurement/allocation work requested by an accepted pending
 * frame. Admit the result through an ordinary application update message.
 * Native projection callbacks and an indivisible grapheme cannot be preempted. */
export function prepareTextAreaLayout(
  request: TextAreaLayoutRequest,
  context: CooperativeWorkContext,
): Promise<PreparedTextAreaLayout> {
  context.signal.throwIfAborted();
  const requested = readTextAreaLayoutRequest(request);
  const dependencies = requested.dependencies;
  const dimensions = Object.freeze({ width: request.width, height: request.height,
    theme: request.theme, widthProfile: request.widthProfile });
  // The accepted request owns only source/geometry inputs. Preparation uses a
  // canonical caret and scroll; consumers rebase live editing state and origin.
  const adopted = {
    state: { document: dependencies.document,
      caret: { position: { offset: 0, affinity: 'downstream' as const } },
      ...(dependencies.scrollbar === undefined ? {} : { scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } }) },
    decorations: dependencies.decorations,
    placeholder: dependencies.rawPlaceholder,
    wrap: dependencies.wrap,
    error: dependencies.rawError,
    ...(dependencies.lineNumbers === undefined ? {} : { lineNumbers: dependencies.lineNumbers }),
    ...(dependencies.scrollbar === undefined ? {} : { scrollbar: dependencies.scrollbar }),
  };
  function* work(): Generator<number, PreparedTextAreaLayout> {
    // Source caret/selection normalization must also remain cheap after a
    // projection concealed or replaced parts of the original document.
    for (const line of textDocumentLineEvents(adopted.state.document)) {
      if (typeof line === 'number') { yield line; continue; }
      yield* textDocumentLineBoundaries(adopted.state.document, line).prepareThroughWork(line.endOffsetExclusive - line.startOffset);
      yield 1;
    }
    const placeholder = (yield* sanitizeTerminalTextWork(adopted.placeholder)).text;
    const error = (yield* sanitizeTerminalTextWork(adopted.error)).text;
    const model = createTextAreaModel(adopted, { placeholder, error });
    assertTextAreaRequestDependencies(request, model);
    const common = { model, theme: dimensions.theme, widthProfile: dimensions.widthProfile,
      disabled: false, busy: false, readOnly: false, inert: false };
    const measurements = new Map(requested.measurements);
    for (const width of request.measurementWidths) {
      if (measurements.has(width)) continue;
      measurements.set(width, yield* measureTextAreaWork({ ...common,
        constraints: { width, height: dimensions.height }, childCount: 0,
        measureChild: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }),
        slots: { count: () => 0, measure: () => ({ minWidth: 0, minHeight: 0, preferredWidth: 0, preferredHeight: 0 }) },
      }));
    }
    const bounds = { row: 0, column: 0, width: dimensions.width, height: dimensions.height };
    const geometry = yield* textAreaGeometryWork({ ...common, bounds, viewport: bounds });
    measurements.set(dimensions.width, geometry.measurement);
    const rowOffsetMap = yield* textAreaRowOffsetMapWork(geometry);
    return retainPreparedTextAreaLayout(dimensions, model, geometry, measurements, rowOffsetMap);
  }
  return prepareWork(work(), context);
}
