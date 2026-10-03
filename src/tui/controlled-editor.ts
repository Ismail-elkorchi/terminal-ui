import { prepareTextAreaReduction } from '../behavior/text-editing.ts';
import type { TextAreaReduction, TextAreaState } from '../behavior/text-editing.ts';
import type { TextAreaTransition } from '../behavior/text-area.ts';
import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import { prepareTextAreaLayout } from '../components/text-area/preparation.ts';
import type { PreparedTextAreaLayout, TextAreaLayoutRequest } from '../components/text-area/contracts.ts';
import { renderNodeId } from '../foundation/identity.ts';
import { createTextChangeSet } from '../text/change-set.ts';
import { textDocumentBytes, type TextDocument } from '../text/document.ts';
import type { TuiChildResult } from './child.ts';
import { createTuiCooperativeWorkContext } from './cooperative-work.ts';
import { createTuiPreparedQuery } from './prepared-query.ts';
import type { TuiPreparedQueryMessage, TuiPreparedQueryState } from './prepared-query.ts';
import type { TuiEffect } from './types.ts';

/** Ordinary caller-owned state. A fresh generation identifies each child lifetime. */
export interface TuiControlledEditorState {
  readonly editing: TextAreaState;
  readonly generation: string | number;
  readonly sourceEpoch: number;
  readonly semanticRevision: number;
  readonly nextOperationId: number;
  readonly queue: readonly TuiEditorIntent[];
  readonly queuedPayloadBytes: number;
  readonly active: TuiEditorOperation | null;
  /** A failed head remains accepted and blocks its successors until retry or explicit discard. */
  readonly error: TerminalDiagnostic | null;
  readonly layout: TuiPreparedQueryState<TuiEditorPreparedLayout>;
  readonly preparedLayout: PreparedTextAreaLayout | null;
  readonly savedDocument: TextDocument;
}

declare const editorOperationBrand: unique symbol;
/** Identity of one prepared edit attempt. Forward unchanged; numeric fields are diagnostic metadata. */
export interface TuiEditorOperation {
  readonly [editorOperationBrand]: true;
  readonly operationId: number;
  readonly sourceEpoch: number;
  readonly semanticRevision: number;
  readonly generation: string | number;
}

/** Capture this revision in view callbacks for absolute coordinates. */
export interface TuiEditorIntentOrigin {
  readonly sourceEpoch: number;
  readonly semanticRevision: number;
  readonly generation: string | number;
}

export type TuiEditorIntent =
  | { readonly kind: 'transition'; readonly operationId: number; readonly transition: TextAreaTransition; readonly payloadBytes: number }
  | { readonly kind: 'settlement'; readonly operationId: number; readonly token: string; readonly payloadBytes: number };

export interface TuiEditorSnapshot extends TuiEditorIntentOrigin {
  readonly document: TextDocument;
  readonly operationId: number;
}

export interface TuiEditorPreparedLayout {
  readonly request: TextAreaLayoutRequest;
  readonly prepared: PreparedTextAreaLayout;
  readonly sourceEpoch: number;
  readonly generation: string | number;
}

export type TuiControlledEditorMessage =
  | { readonly kind: 'reduced'; readonly operation: TuiEditorOperation; readonly reduction: TextAreaReduction }
  | { readonly kind: 'failed'; readonly operation: TuiEditorOperation; readonly diagnostic: TerminalDiagnostic }
  | { readonly kind: 'layout'; readonly message: TuiPreparedQueryMessage<TuiEditorPreparedLayout> };

export type TuiControlledEditorOutput =
  | { readonly kind: 'settled'; readonly token: string; readonly snapshot: TuiEditorSnapshot }
  | { readonly kind: 'rejected'; readonly reason: 'intent-count-limit' | 'payload-byte-limit' | 'stale-coordinates' | 'pending-intents' | 'layout-pending' }
  | { readonly kind: 'failed'; readonly operationId: number; readonly diagnostic: TerminalDiagnostic }
  | { readonly kind: 'discarded'; readonly operationIds: readonly number[] }
  | { readonly kind: 'historyRejected'; readonly rejection: NonNullable<TextAreaReduction['historyRejection']> };

export interface TuiControlledEditorResult<TMessage> extends TuiChildResult<TuiControlledEditorState, TMessage, TuiControlledEditorOutput> {
  /** Admission is explicit. A runtime capacity rejection also leaves caller state unpublished. */
  readonly accepted: boolean;
}

export interface TuiControlledEditor<TMessage> {
  init(editing: TextAreaState, generation?: string | number): TuiControlledEditorState;
  requestIntent(state: TuiControlledEditorState, transition: TextAreaTransition, origin?: TuiEditorIntentOrigin): TuiControlledEditorResult<TMessage>;
  requestLayout(state: TuiControlledEditorState, request: TextAreaLayoutRequest): TuiControlledEditorResult<TMessage>;
  update(state: TuiControlledEditorState, message: TuiControlledEditorMessage): TuiControlledEditorResult<TMessage>;
  /** The FIFO barrier snapshots all preceding accepted intents; later edits can continue. */
  requestSettlement(state: TuiControlledEditorState, token: string): TuiControlledEditorResult<TMessage>;
  retry(state: TuiControlledEditorState): TuiControlledEditorResult<TMessage>;
  discardPending(state: TuiControlledEditorState): TuiControlledEditorResult<TMessage>;
  replaceSource(state: TuiControlledEditorState, editing: TextAreaState, options: { readonly pending: 'reject' | 'discard' }): TuiControlledEditorResult<TMessage>;
  markSaved(state: TuiControlledEditorState, snapshot: TuiEditorSnapshot): TuiControlledEditorState;
  isDirty(state: TuiControlledEditorState): boolean;
}

/** Bounded reliable editing and latest-wins exact layout work, using ordinary child effects. */
export function createTuiControlledEditor<TMessage>(options: {
  readonly id: string;
  readonly toMessage: (message: TuiControlledEditorMessage) => TMessage;
  readonly maxPendingIntents?: number;
  /** Retained UTF-16 payload plus conservative descriptor overhead, including the active head. */
  readonly maxPendingBytes?: number;
  /** Candidate overflow blocks the accepted head with a visible recoverable failure. */
  readonly maxDocumentBytes?: number;
}): TuiControlledEditor<TMessage> {
  const id = renderNodeId(options.id, 'TUI controlled editor');
  const maxPendingIntents = positiveInteger(options.maxPendingIntents ?? 128, 'maxPendingIntents');
  const maxPendingBytes = positiveInteger(options.maxPendingBytes ?? 1_048_576, 'maxPendingBytes');
  const maxDocumentBytes = options.maxDocumentBytes === undefined ? undefined : positiveInteger(options.maxDocumentBytes, 'maxDocumentBytes');
  const editId = `${id}:edit`;
  const layoutQuery = createTuiPreparedQuery<{
    readonly request: TextAreaLayoutRequest; readonly sourceEpoch: number; readonly generation: string | number;
  }, TuiEditorPreparedLayout, TMessage>({
    id: `${id}:layout`,
    prepare: async (input, context) => ({ ...input, prepared: await prepareTextAreaLayout(input.request, createTuiCooperativeWorkContext(context)) }),
    toMessage: (message) => options.toMessage({ kind: 'layout', message }),
  });

  function rejected(state: TuiControlledEditorState, reason: Extract<TuiControlledEditorOutput, { kind: 'rejected' }>['reason']): TuiControlledEditorResult<TMessage> {
    return { state, accepted: false, outputs: [{ kind: 'rejected', reason }] };
  }

  function headEffect(editing: TextAreaState, operation: TuiEditorOperation, transition: TextAreaTransition): TuiEffect<TMessage> {
    return {
      id: editId, concurrency: 'enqueue',
      async run(context) {
        const reduction = await prepareTextAreaReduction(editing, transition, createTuiCooperativeWorkContext(context));
        context.signal.throwIfAborted();
        if (maxDocumentBytes !== undefined && textDocumentBytes(reduction.state.document) > maxDocumentBytes) {
          return { kind: 'message', message: options.toMessage({ kind: 'failed', operation,
            diagnostic: diagnostic('TUI_EFFECT_REJECTED', `Editor document exceeds the ${String(maxDocumentBytes)} byte limit. Retry or explicitly discard the accepted intent.`) }) };
        }
        return { kind: 'message', message: options.toMessage({ kind: 'reduced', operation, reduction }) };
      },
      onError: ({ diagnostic }) => ({ kind: 'message', message: options.toMessage({ kind: 'failed', operation, diagnostic }) }),
    };
  }

  function advance(state: TuiControlledEditorState, outputs: TuiControlledEditorOutput[] = []): TuiControlledEditorResult<TMessage> {
    if (state.active !== null || state.error !== null) return { state, accepted: true, ...(outputs.length === 0 ? {} : { outputs }) };
    let next = state;
    while (next.queue[0]?.kind === 'settlement') {
      const head = next.queue[0];
      outputs.push({ kind: 'settled', token: head.token, snapshot: Object.freeze({
        document: next.editing.document, sourceEpoch: next.sourceEpoch, semanticRevision: next.semanticRevision,
        generation: next.generation, operationId: head.operationId,
      }) });
      next = { ...next, queue: next.queue.slice(1), queuedPayloadBytes: next.queuedPayloadBytes - head.payloadBytes };
    }
    const head = next.queue[0];
    if (head === undefined) return { state: next, accepted: true, ...(outputs.length === 0 ? {} : { outputs }) };
    const operation: TuiEditorOperation = Object.freeze({ operationId: head.operationId, sourceEpoch: next.sourceEpoch,
      semanticRevision: next.semanticRevision, generation: next.generation }) as TuiEditorOperation;
    return { state: { ...next, active: operation }, accepted: true,
      effects: [headEffect(next.editing, operation, head.transition)], ...(outputs.length === 0 ? {} : { outputs }) };
  }

  function accept(state: TuiControlledEditorState, intent: TuiEditorIntent): TuiControlledEditorResult<TMessage> {
    if (state.queue.length >= maxPendingIntents) return rejected(state, 'intent-count-limit');
    if (intent.payloadBytes > maxPendingBytes - state.queuedPayloadBytes) return rejected(state, 'payload-byte-limit');
    return advance({ ...state, nextOperationId: state.nextOperationId + 1,
      queue: Object.freeze([...state.queue, Object.freeze(intent)]), queuedPayloadBytes: state.queuedPayloadBytes + intent.payloadBytes });
  }

  function discardPending(state: TuiControlledEditorState): TuiControlledEditorResult<TMessage> {
    return { state: { ...state, queue: Object.freeze([]), queuedPayloadBytes: 0, active: null, error: null }, accepted: true,
      cancel: [{ kind: 'effect', id: editId }], outputs: state.queue.length === 0 ? [] : [{ kind: 'discarded', operationIds: Object.freeze(state.queue.map((intent) => intent.operationId)) }] };
  }

  return Object.freeze({
    init(editing: TextAreaState, generation: string | number = 0): TuiControlledEditorState {
      return { editing, generation, sourceEpoch: 0, semanticRevision: 0, nextOperationId: 1,
        queue: Object.freeze([]), queuedPayloadBytes: 0, active: null, error: null,
        layout: layoutQuery.init(), preparedLayout: null, savedDocument: editing.document };
    },
    requestIntent(state: TuiControlledEditorState, transition: TextAreaTransition, origin?: TuiEditorIntentOrigin) {
      if (transition.kind === 'unavailable') return rejected(state, transition.reason);
      if (hasAbsoluteCoordinates(transition) && (state.queue.length !== 0 || origin?.sourceEpoch !== state.sourceEpoch || origin.semanticRevision !== state.semanticRevision || origin.generation !== state.generation)) {
        return rejected(state, 'stale-coordinates');
      }
      if (state.queue.length >= maxPendingIntents) return rejected(state, 'intent-count-limit');
      // Validate capacity before owning an array or scanning/encoding any string payload.
      const payloadBytes = intentPayloadBytes(transition, maxPendingBytes - state.queuedPayloadBytes);
      if (payloadBytes > maxPendingBytes - state.queuedPayloadBytes) return rejected(state, 'payload-byte-limit');
      return accept(state, { kind: 'transition', operationId: state.nextOperationId, transition: ownTransition(transition), payloadBytes });
    },
    requestSettlement(state: TuiControlledEditorState, token: string) {
      return accept(state, { kind: 'settlement', operationId: state.nextOperationId, token, payloadBytes: 64 + token.length * 2 });
    },
    requestLayout(state: TuiControlledEditorState, request: TextAreaLayoutRequest): TuiControlledEditorResult<TMessage> {
      if (request.document !== state.editing.document) return { state, accepted: false };
      const result = layoutQuery.request(state.layout, { request, sourceEpoch: state.sourceEpoch, generation: state.generation });
      return { ...result, state: { ...state, layout: result.state }, accepted: true };
    },
    update(state: TuiControlledEditorState, message: TuiControlledEditorMessage): TuiControlledEditorResult<TMessage> {
      if (message.kind === 'layout') {
        const result = layoutQuery.update(state.layout, message.message);
        if (result.state === state.layout) return { state, accepted: false };
        const prepared = result.state.result;
        return { ...result, accepted: true, state: { ...state, layout: result.state,
          preparedLayout: prepared?.sourceEpoch === state.sourceEpoch && prepared.generation === state.generation
            && prepared.request.document === state.editing.document ? prepared.prepared : state.preparedLayout } };
      }
      if (!sameOperation(state.active, message.operation)) return { state, accepted: false };
      if (message.kind === 'failed') return { state: { ...state, active: null, error: message.diagnostic }, accepted: true,
        outputs: [{ kind: 'failed', operationId: message.operation.operationId, diagnostic: message.diagnostic }] };
      const head = state.queue[0];
      if (head === undefined) return { state, accepted: false };
      const changedDocument = message.reduction.state.document !== state.editing.document;
      const cancelled = changedDocument ? layoutQuery.cancel(state.layout) : undefined;
      const result = advance({ ...state, editing: message.reduction.state,
        semanticRevision: state.semanticRevision + 1, active: null, error: null,
        queue: state.queue.slice(1), queuedPayloadBytes: state.queuedPayloadBytes - head.payloadBytes,
        ...(cancelled === undefined ? {} : { layout: cancelled.state, preparedLayout: null }) },
      message.reduction.historyRejection === undefined ? [] : [{ kind: 'historyRejected', rejection: message.reduction.historyRejection }]);
      return { ...result, ...(cancelled?.cancel === undefined ? {} : { cancel: cancelled.cancel }) };
    },
    retry(state: TuiControlledEditorState) {
      if (state.active !== null || state.error === null) return { state, accepted: true };
      const head = state.queue[0];
      if (head === undefined) return advance({ ...state, error: null });
      // A retry is a new execution. Late failure or success from its predecessor
      // must not settle the newly running attempt, even in the same revision.
      return advance({ ...state, error: null, nextOperationId: state.nextOperationId + 1,
        queue: Object.freeze([Object.freeze({ ...head, operationId: state.nextOperationId }), ...state.queue.slice(1)]) });
    },
    discardPending,
    replaceSource(state: TuiControlledEditorState, editing: TextAreaState, disposition: { readonly pending: 'reject' | 'discard' }): TuiControlledEditorResult<TMessage> {
      if (!['reject', 'discard'].includes(disposition.pending)) throw new TypeError('Source replacement requires an explicit pending queue disposition.');
      if (state.queue.length !== 0 && disposition.pending === 'reject') return rejected(state, 'pending-intents');
      const discarded = discardPending(state);
      const cancelled = layoutQuery.cancel(state.layout);
      return { state: { ...discarded.state, editing, sourceEpoch: state.sourceEpoch + 1, semanticRevision: 0,
        savedDocument: editing.document, layout: cancelled.state, preparedLayout: null }, accepted: true,
        cancel: [...discarded.cancel ?? [], ...cancelled.cancel ?? []], outputs: discarded.outputs ?? [] };
    },
    markSaved(state: TuiControlledEditorState, snapshot: TuiEditorSnapshot): TuiControlledEditorState {
      return snapshot.sourceEpoch === state.sourceEpoch && snapshot.generation === state.generation
        ? { ...state, savedDocument: snapshot.document } : state;
    },
    isDirty(state: TuiControlledEditorState) {
      return state.editing.document !== state.savedDocument || state.queue.some((intent) => intent.kind === 'transition' && changesText(intent.transition));
    },
  });
}

function sameOperation(left: TuiEditorOperation | null, right: TuiEditorOperation): boolean {
  return left !== null && left === right;
}

function hasAbsoluteCoordinates(transition: TextAreaTransition): boolean {
  return transition.kind === 'pointer' || transition.kind === 'scroll' || transition.kind === 'applyChanges'
    || (transition.kind === 'edit' && (transition.operation.kind === 'moveTo' || transition.operation.kind === 'replaceRange'));
}

function changesText(transition: TextAreaTransition): boolean {
  return transition.kind === 'undo' || transition.kind === 'redo' || transition.kind === 'applyChanges'
    || (transition.kind === 'edit' && (transition.operation.kind.startsWith('delete') || ['insert', 'replaceSelection', 'replaceRange'].includes(transition.operation.kind)));
}

function intentPayloadBytes(transition: TextAreaTransition, available: number): number {
  let bytes = 128;
  if (transition.kind === 'edit' && 'text' in transition.operation) return bytes + transition.operation.text.length * 2;
  if (transition.kind === 'applyChanges') {
    if (transition.changeSet.changes.length * 64 > available) return available + 1;
    for (const change of transition.changeSet.changes) {
      bytes += 64 + change.insertedText.length * 2;
      if (bytes > available) return bytes;
    }
  }
  return bytes;
}

function ownTransition(transition: TextAreaTransition): TextAreaTransition {
  if (transition.kind === 'applyChanges') return Object.freeze({ ...transition, changeSet: createTextChangeSet(transition.changeSet.changes) });
  if (transition.kind === 'edit') {
    const operation = transition.operation;
    return Object.freeze({ ...transition, operation: Object.freeze({ ...operation,
      ...('range' in operation ? { range: Object.freeze({ ...operation.range }) } : {}),
      ...('caret' in operation ? { caret: Object.freeze({ ...operation.caret, position: Object.freeze({ ...operation.caret.position }) }) } : {}),
    }) });
  }
  if (transition.kind === 'pointer') return Object.freeze({ ...transition, transition: Object.freeze({ ...transition.transition }),
    ...(transition.scrollRequest === undefined ? {} : { scrollRequest: Object.freeze({ ...transition.scrollRequest, nextState: Object.freeze({ ...transition.scrollRequest.nextState }) }) }) });
  if (transition.kind === 'scroll') return Object.freeze({ ...transition, request: Object.freeze({ ...transition.request, nextState: Object.freeze({ ...transition.request.nextState }) }) });
  return Object.freeze({ ...transition });
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
  return value;
}
