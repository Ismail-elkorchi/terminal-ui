import { createInputAmbiguityDeadline, createInputPipeline } from '../input/index.ts';
import type { TerminalHost, TerminalInputChunk } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';

type InputRead =
  | { readonly kind: 'input'; readonly value: IteratorResult<TerminalInputChunk> }
  | { readonly kind: 'ambiguity' };

export async function* promptInputEvents(
  host: TerminalHost,
  signal?: AbortSignal
): AsyncIterable<InputEvent> {
  const lifetime = linkedAbortController(signal);
  const input = host.stdin.read({ signal: lifetime.controller.signal })[Symbol.asyncIterator]();
  const pipeline = createInputPipeline();
  const ambiguity = createInputAmbiguityDeadline<InputRead>(host.clock, pipeline.profile.escapeDelayMs);
  let pendingRead: Promise<IteratorResult<TerminalInputChunk>> | undefined;
  let escapePending = false;

  try {
    for (;;) {
      pendingRead ??= input.next();
      const read = pendingRead.then((value): InputRead => ({ kind: 'input', value }));
      const next = escapePending
        ? await Promise.race([
            read,
            ambiguity.schedule(() => Promise.resolve({ kind: 'ambiguity' } as const))
          ])
        : await read;

      if (lifetime.controller.signal.aborted) return;
      if (next === undefined) continue;
      if (next.kind === 'ambiguity') {
        for (const event of pipeline.flush().events) yield event;
        escapePending = false;
        continue;
      }

      ambiguity.cancel();
      pendingRead = undefined;
      if (next.value.done === true) {
        for (const event of pipeline.flush().events) yield event;
        return;
      }
      const batch = pipeline.decode(next.value.value);
      escapePending = batch.pending.kind === 'escape';
      for (const event of batch.events) yield event;
      if (!escapePending) ambiguity.cancel();
    }
  } finally {
    ambiguity.cancel();
    lifetime.controller.abort();
    lifetime.detach();
    await input.return?.();
  }
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
