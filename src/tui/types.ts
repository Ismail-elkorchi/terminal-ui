import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilities, TerminalClock, TerminalHost, TerminalInputChunk, TerminalViewport } from '../host/index.ts';
import type { InputDecodeOptions, InputEvent } from '../input/index.ts';
import type { InteractionTranscript, TranscriptPolicy, TranscriptRecorder } from '../transcript/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { Frame } from './frame.ts';
import type { FocusPath } from './focus.ts';

export interface TuiDefinition<TState, TMessage> {
  readonly id?: string;
  readonly init: TuiInit<TState, TMessage>;
  readonly update: TuiUpdate<TState, TMessage>;
  readonly view: TuiView<TState, TMessage>;
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly onExit?: TuiExitHandler<TState>;
  readonly transcript?: TranscriptPolicy;
  readonly accessibility?: TuiAccessibilityOptions<TState>;
}

export interface TuiApp<TState, TMessage> {
  readonly id: string;
  readonly definition: TuiDefinition<TState, TMessage>;
}

export type TuiInit<TState, TMessage> = (context: TuiContext<TMessage>) => TState | Promise<TState>;
export type TuiUpdate<TState, TMessage> = (
  state: TState,
  message: TMessage,
  context: TuiContext<TMessage>
) => TuiUpdateResult<TState, TMessage> | Promise<TuiUpdateResult<TState, TMessage>>;
export type TuiView<TState, TMessage> = (state: TState, context: TuiContext<TMessage>) => Widget<TMessage>;

export interface TuiUpdateResult<TState, TMessage> {
  readonly state: TState;
  readonly commands?: readonly TuiCommand<TMessage>[];
  readonly exit?: TuiExitRequest;
}

export interface TuiContext<TMessage> {
  readonly host: TerminalHost;
  readonly viewport: TerminalViewport;
  readonly capabilities: TerminalCapabilities;
  readonly clock: TerminalClock;
  dispatch(message: TMessage): void;
}

export interface TuiCommand<TMessage> {
  readonly kind: 'dispatch';
  readonly message: TMessage;
}

export interface TuiExitRequest {
  readonly reason?: string;
}

export type TuiSubscriptions<TState, TMessage> = (state: TState) => readonly TuiCommand<TMessage>[];
export type TuiExitHandler<TState> = (state: TState) => void | Promise<void>;

export interface TuiAccessibilityOptions<TState> {
  readonly describe?: (state: TState) => AccessibleSnapshot;
}

export type TuiExit<TState> =
  | {
      readonly status: 'completed';
      readonly state: TState;
      readonly reason?: string;
      readonly diagnostics: readonly TerminalDiagnostic[];
      readonly transcript?: InteractionTranscript;
      readonly snapshot: AccessibleSnapshot;
    }
  | {
      readonly status: 'cancelled' | 'interrupted' | 'error';
      readonly state?: TState;
      readonly diagnostics: readonly TerminalDiagnostic[];
      readonly transcript?: InteractionTranscript;
      readonly snapshot: AccessibleSnapshot;
    };

export interface TuiRuntimeOptions<TState, TMessage> {
  readonly app: TuiApp<TState, TMessage>;
  readonly host: TerminalHost;
  readonly initialFocusPath?: FocusPath;
  readonly transcript?: TranscriptRecorder;
}

export interface TuiRuntime<TState, TMessage> {
  readonly app: TuiApp<TState, TMessage>;
  readonly host: TerminalHost;
  start(): Promise<Frame>;
  dispatch(message: TMessage): Promise<TState>;
  resize(viewport: TerminalViewport): Promise<Frame>;
  handleInput(event: InputEvent): Promise<TuiInputResult<TState>>;
  handleInputChunk(
    chunk: TerminalInputChunk,
    decodeOptions?: InputDecodeOptions
  ): Promise<readonly TuiInputResult<TState>[]>;
  flushInput(): Promise<readonly TuiInputResult<TState>[]>;
  resetInput(): void;
  getState(): TState | undefined;
  frame(): Frame | undefined;
  exit(): TuiExit<TState> | undefined;
}

export interface TuiInputResult<TState> {
  readonly handled: boolean;
  readonly state: TState;
  readonly frame: Frame;
  readonly exit?: TuiExit<TState>;
}
