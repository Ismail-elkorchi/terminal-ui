import { createInputAmbiguityDeadline, createInputPipeline } from '../input/index.ts';
import type { TerminalHost, TerminalInputChunk } from '../host/index.ts';
import type { InputEvent, InputPendingState } from '../input/index.ts';

type InputRead =
  | { readonly kind: 'input'; readonly value: IteratorResult<TerminalInputChunk> }
  | { readonly kind: 'ambiguity' };

export async function* promptInputEvents(
  host: TerminalHost,
  signal?: AbortSignal,
  options: { readonly bracketedPaste: boolean } = { bracketedPaste: false }
): AsyncIterable<InputEvent> {
  const lifetime = linkedAbortController(signal);
  const input = host.stdin.read({ signal: lifetime.controller.signal })[Symbol.asyncIterator]();
  const pipeline = createInputPipeline({ bracketedPaste: options.bracketedPaste });
  const ambiguity = createInputAmbiguityDeadline<InputRead>(host.clock, pipeline.profile.escapeDelayMs);
  let pendingRead: Promise<IteratorResult<TerminalInputChunk>> | undefined;
  let pending: InputPendingState = { kind: 'none' };

  try {
    for (;;) {
      pendingRead ??= input.next();
      const read = pendingRead.then((value): InputRead => ({ kind: 'input', value }));
      const next = isAmbiguous(pending)
        ? await Promise.race([
            read,
            ambiguity.schedule(() => Promise.resolve({ kind: 'ambiguity' } as const))
          ])
        : await read;

      if (lifetime.controller.signal.aborted) return;
      if (next === undefined) continue;
      if (next.kind === 'ambiguity') {
        for (const event of pipeline.flush().events) yield event;
        pending = { kind: 'none' };
        continue;
      }

      ambiguity.cancel();
      pendingRead = undefined;
      if (next.value.done === true) {
        for (const event of pipeline.flush().events) yield event;
        return;
      }
      const batch = pipeline.decode(next.value.value);
      pending = batch.pending;
      for (const event of batch.events) yield event;
      if (!isAmbiguous(pending)) ambiguity.cancel();
    }
  } finally {
    ambiguity.cancel();
    lifetime.controller.abort();
    lifetime.detach();
    await input.return?.();
  }
}

function isAmbiguous(pending: InputPendingState): boolean {
  return pending.kind === 'escape' || pending.kind === 'sequence';
}

function linkedAbortController(signal: AbortSignal | undefined): {
  readonly controller: AbortController;
  readonly detach: () => void;
} {
  const controller = new AbortController();
  if (signal === undefined) return { controller, detach: () => undefined };
  if (signal.aborted) controller.abort(signal.reason);
  const abort = (): void => {
    controller.abort(signal.reason);
  };
  if (!signal.aborted) signal.addEventListener('abort', abort, { once: true });
  return {
    controller,
    detach: () => {
      signal.removeEventListener('abort', abort);
    }
  };
}
