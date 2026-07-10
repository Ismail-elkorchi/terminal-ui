import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalClock, TerminalHost, TerminalInputChunk, TerminalViewport } from '../host/index.ts';
import type { InputDecodeOptions, InputEvent, InputPipelineOptions, InputTrigger } from '../input/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { InteractionTranscript, TranscriptPolicy, TranscriptRecorder } from '../transcript/index.ts';
import type { Element } from '../components/element.ts';
import type { Frame } from './frame.ts';
import type { FocusPath } from './focus.ts';
import type { SessionProtocolPolicy } from './session-policy.ts';

export interface TuiDefinition<TState, TMessage> {
  readonly id?: string;
  readonly init: TuiInit<TState>;
  readonly update: TuiUpdate<TState, TMessage>;
  readonly view: TuiView<TState, TMessage>;
  readonly keyBindings?: readonly TuiKeyBinding<TState, TMessage>[];
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly onExit?: TuiExitHandler<TState>;
  readonly transcript?: TranscriptPolicy;
  readonly accessibility?: TuiAccessibilityOptions<TState>;
  readonly nonTty?: TuiNonTtyPolicy<TMessage>;
}

export interface TuiApp<TState, TMessage> {
  readonly id: string;
  readonly definition: TuiDefinition<TState, TMessage>;
}

export type TuiInit<TState> = (context: TuiContext) => TState;
export type TuiUpdate<TState, TMessage> = (
  state: TState,
  message: TMessage,
  context: TuiContext
) => TuiUpdateResult<TState, TMessage>;
export type TuiView<TState, TMessage> = (state: TState, context: TuiContext) => Element<TMessage>;

export type TuiKeyBindingPhase = 'beforeFocus' | 'afterFocus';

export interface TuiKeyBindingContext<TState> {
  readonly state: TState;
  readonly event: InputEvent;
  readonly trigger: InputTrigger;
  readonly focusPath?: FocusPath;
}

interface TuiKeyBindingBase<TState> {
  readonly id: string;
  readonly triggers: readonly InputTrigger[];
  readonly phase?: TuiKeyBindingPhase;
  readonly label?: string;
  readonly enabled?: boolean | ((context: TuiKeyBindingContext<TState>) => boolean);
}

export type TuiKeyBinding<TState, TMessage> =
  | TuiKeyBindingBase<TState> & {
      readonly message: TMessage;
      readonly toMessage?: never;
    }
  | TuiKeyBindingBase<TState> & {
      readonly message?: never;
      readonly toMessage: (context: TuiKeyBindingContext<TState>) => TMessage | undefined;
    };

export interface TuiUpdateResult<TState, TMessage> {
  readonly state: TState;
  readonly effects?: readonly TuiEffect<TMessage>[];
  readonly exit?: TuiExitRequest;
}

export interface TuiContext {
  readonly host: TerminalHost;
  readonly viewport: TerminalViewport;
  readonly capabilities: TerminalCapabilityProfile;
  readonly diagnostics: readonly TerminalDiagnostic[];
  readonly clock: TerminalClock;
}

export type TuiMessageSource = 'input' | 'signal' | 'timer' | 'external' | 'effect';

export type TuiNonTtyMode = 'reject' | 'transcript_only' | 'line_fallback' | 'last_frame';

export type TuiNonTtyPolicy<TMessage> =
  | {
      readonly mode: 'reject' | 'transcript_only' | 'last_frame';
      readonly diagnosticHint?: string;
    }
  | {
      readonly mode: 'line_fallback';
      readonly diagnosticHint?: string;
      message(line: string): TMessage;
    };

export interface TuiEffectContext extends TuiContext {
  readonly signal: AbortSignal;
}

export interface TuiEffectFailure {
  readonly id: string;
  readonly diagnostic: TerminalDiagnostic;
}

export interface TuiEffect<TMessage> {
  readonly id: string;
  run(context: TuiEffectContext): Promise<TMessage | readonly TMessage[] | undefined>;
  onError?(failure: TuiEffectFailure): TMessage | undefined;
}

export type TuiEventDelivery = 'sequential' | 'latest';

export type TuiSourceLifecycle =
  | { readonly kind: 'completed'; readonly id: string }
  | { readonly kind: 'failed'; readonly id: string; readonly diagnostic: TerminalDiagnostic };

export interface TuiEventSource<TMessage> {
  readonly id: string;
  readonly source?: Exclude<TuiMessageSource, 'input' | 'effect'>;
  readonly delivery: TuiEventDelivery;
  messages(context: TuiSubscriptionContext): AsyncIterable<TMessage>;
  onLifecycle?(event: TuiSourceLifecycle): TMessage | undefined;
  dispose?(): void | Promise<void>;
}

export interface TuiSubscriptionContext extends TuiContext {
  readonly signal: AbortSignal;
}

export interface TuiExitRequest {
  readonly reason?: string;
}

export type TuiSubscriptions<TState, TMessage> = (
  state: TState,
  context: TuiContext
) => readonly TuiEventSource<TMessage>[];
export type TuiExitHandler<TState> = (state: TState) => void | Promise<void>;

export interface TuiAccessibilityOptions<TState> {
  readonly describe?: (state: TState) => AccessibleSnapshot;
}

export type TuiTheme<TState> =
  | TerminalTheme
  | TerminalThemeDefinition
  | ((state: TState) => TerminalTheme | TerminalThemeDefinition);

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
  readonly theme?: TuiTheme<TState>;
  readonly transcript?: TranscriptRecorder;
  readonly input?: InputPipelineOptions;
  readonly diagnostics?: readonly TerminalDiagnostic[];
}

export interface TuiRunOptions<TState = unknown> {
  readonly initialFocusPath?: FocusPath;
  readonly theme?: TuiTheme<TState>;
  readonly sessionPolicy?: SessionProtocolPolicy;
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
  nextChange(): Promise<TuiRuntimeChange<TState>>;
  dispose(): Promise<void>;
  getState(): TState | undefined;
  frame(): Frame | undefined;
  exit(): TuiExit<TState> | undefined;
  diagnostics(): readonly TerminalDiagnostic[];
}

export type TuiRuntimeChange<TState> =
  | { readonly kind: 'frame'; readonly frame: Frame }
  | { readonly kind: 'exit'; readonly exit: TuiExit<TState> };

export interface TuiInputResult<TState> {
  readonly handled: boolean;
  readonly state: TState;
  readonly frame: Frame;
  readonly exit?: TuiExit<TState>;
}
