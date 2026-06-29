import { diagnostic } from '../diagnostics.ts';
import { createTuiContext } from './context.ts';
import { completedExitFromSnapshot } from './exit.ts';
import { tuiSnapshot } from './lifecycle.ts';
import { diffFrames, renderFramePlain } from './render.ts';
import { renderCurrentFrame } from './runtime-frame.ts';
import { recordTuiFrame } from './transcript.ts';
import type { TerminalHost, TerminalInputChunk } from '../host/index.ts';
import type { TranscriptRecorder } from '../transcript/index.ts';
import type { TuiApp, TuiExit, TuiRuntimeOptions } from './types.ts';

export async function runTuiNonTty<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined
): Promise<TuiExit<TState> | undefined> {
  const capabilities = await host.getCapabilities();
  if (capabilities.isTty) return undefined;
  const policy = app.definition.nonTty ?? { mode: 'reject' as const };
  if (policy.mode === 'reject') {
    return {
      status: 'error',
      diagnostics: [
        diagnostic('HOST_CAPABILITY_UNAVAILABLE', 'Full-screen TUI requires a TTY terminal host.', {
          target: app.id,
          ...(policy.diagnosticHint === undefined ? {} : { hint: policy.diagnosticHint }),
          data: {
            runtime: capabilities.runtime,
            isTty: false
          }
        })
      ],
      snapshot: tuiSnapshot(app.id)
    };
  }

  try {
    const context = await createTuiContext<TMessage>(host, () => undefined);
    let state = await app.definition.init(context) as TState;
    if (policy.mode === 'line_fallback') {
      const line = await readLine(host);
      if (line !== undefined) {
        const result = await app.definition.update(state, policy.message(line), context);
        state = result.state;
      }
    }
    const frame = renderCurrentFrame(app, state, context, undefined, runtimeOptions(app, host, transcript), 0).frame;
    recordTuiFrame(transcript, frame, diffFrames(undefined, frame));
    if (policy.mode === 'last_frame' || policy.mode === 'line_fallback') {
      await host.write({ text: `${renderFramePlain(frame)}\n` });
    }
    await app.definition.onExit?.(state);
    return completedExitFromSnapshot(state, frame.accessibility, policy.mode);
  } catch (cause) {
    return {
      status: 'error',
      diagnostics: [
        diagnostic('TUI_RENDER_FAILED', 'Non-TTY TUI rendering failed.', {
          cause,
          target: app.id
        })
      ],
      snapshot: tuiSnapshot(app.id)
    };
  }
}

function runtimeOptions<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
  host: TerminalHost,
  transcript: TranscriptRecorder | undefined
): TuiRuntimeOptions<TState, TMessage> {
  return {
    app,
    host,
    ...(transcript === undefined ? {} : { transcript })
  };
}

async function readLine(host: TerminalHost): Promise<string | undefined> {
  let text = '';
  for await (const chunk of host.stdin.read()) {
    text += chunkText(chunk);
    const newline = text.search(/\r?\n/u);
    if (newline !== -1) return text.slice(0, newline);
  }
  return text.length === 0 ? undefined : text;
}

function chunkText(chunk: TerminalInputChunk): string {
  return typeof chunk.data === 'string' ? chunk.data : new TextDecoder().decode(chunk.data);
}
