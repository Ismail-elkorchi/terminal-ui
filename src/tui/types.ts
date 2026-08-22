import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { DiagnosticOccurrence, TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalCapabilityProfile, TerminalClock, TerminalHost, TerminalInputChunk, TerminalSize } from '../host/index.ts';
import type { InputEvent, InputPipelineOptions, InputTrigger } from '../input/index.ts';
import type { TerminalTheme, TerminalThemeDefinition } from '../theme/index.ts';
import type { InteractionTranscript, TranscriptRecorder } from '../transcript/index.ts';
import type { Element } from '../element/index.ts';
import type { Frame } from '../renderer/contracts.ts';
import type { FocusPath, InitialFocusSelector } from '../interaction/focus.ts';
import type { SessionProtocolPolicy } from './session-policy.ts';
import type { MessageResolution, TuiMessageSource } from '../interaction/message.ts';
import type { GraphicsBudgetLimits, TerminalGraphicsMode } from '../graphics/index.ts';

export interface TuiDefinition<TState, TMessage> {
  readonly id?: string;
  readonly init: TuiInit<TState, TMessage>;
  readonly update: TuiUpdate<TState, TMessage>;
  readonly view: TuiView<TState, TMessage>;
  readonly inputBindings?: readonly TuiInputBinding<TState, TMessage>[];
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly onExit?: TuiExitHandler<TState>;
  readonly transcript?: boolean;
  readonly nonTty?: TuiNonTtyPolicy;
}

declare const tuiAppBrand: unique symbol;

export interface TuiApp<TState, TMessage> {
  readonly [tuiAppBrand]: {
    readonly state: TState;
    readonly message: TMessage;
  };
  readonly id: string;
}

export type TuiInit<TState, TMessage> = (
  context: TuiContext
) => TuiInitialResult<TState, TMessage>;

export interface TuiInitialResult<TState, TMessage> {
  readonly state: TState;
  readonly effects?: readonly TuiEffect<TMessage>[];
  readonly focus?: InitialFocusSelector;
  readonly exit?: TuiExitRequest;
}
export type TuiUpdate<TState, TMessage> = (
  state: TState,
  message: TMessage,
  context: TuiContext
) => TuiUpdateResult<TState, TMessage>;
export type TuiView<TState, TMessage> = (state: TState, context: TuiContext) => Element<TMessage>;

export type TuiInputBindingPhase = 'beforeFocus' | 'afterFocus';

export interface TuiInputBindingContext<TState> {
  readonly state: TState;
  readonly event: InputEvent;
  readonly trigger: InputTrigger;
  readonly focusPath?: FocusPath;
}

interface TuiInputBindingBase<TState> {
  readonly id: string;
  readonly triggers: readonly InputTrigger[];
  readonly phase?: TuiInputBindingPhase;
  readonly label?: string;
  readonly enabled?: boolean | ((context: TuiInputBindingContext<TState>) => boolean);
}

export type TuiInputBinding<TState, TMessage> =
  | TuiInputBindingBase<TState> & {
      readonly message: TMessage;
      readonly toMessage?: never;
    }
  | TuiInputBindingBase<TState> & {
      readonly message?: never;
      readonly toMessage: (context: TuiInputBindingContext<TState>) => MessageResolution<TMessage>;
    };

export interface TuiBindingHelpItem {
  readonly id: string;
  readonly label: string;
  readonly bindings: readonly {
    readonly binding: import('../interaction/key-binding.ts').KeyboardBinding;
    readonly label: string;
  }[];
}

export interface TuiUpdateResult<TState, TMessage> {
  readonly state: TState;
  readonly cancelEffects?: readonly string[];
  readonly effects?: readonly TuiEffect<TMessage>[];
  readonly focus?: InitialFocusSelector;
  readonly exit?: TuiExitRequest;
}

export interface TuiContext {
  readonly terminalSize: TerminalSize;
  readonly capabilities: TerminalCapabilityProfile;
  readonly diagnostics: readonly DiagnosticOccurrence[];
  readonly clock: TerminalClock;
}

export type { TuiMessageSource } from '../interaction/message.ts';

export type TuiNonTtyMode = 'reject' | 'transcript_only' | 'last_frame';

export interface TuiNonTtyPolicy {
  readonly mode: TuiNonTtyMode;
  readonly diagnosticHint?: string;
}

export interface TuiEffectContext extends TuiContext {
  readonly signal: AbortSignal;
  readonly withTerminalSuspended: <TValue>(operation: () => Promise<TValue>) => Promise<TValue>;
  readonly copySelectedText: (
    input: import('./selection.ts').CopySelectedTextInput,
  ) => Promise<import('./selection.ts').CopySelectedTextResult>;
}

export interface TuiEffectFailure {
  readonly id: string;
  readonly diagnostic: TerminalDiagnostic;
}

export type TuiEffectOutput<TMessage> =
  | { readonly kind: 'none' }
  | { readonly kind: 'message'; readonly message: TMessage }
  | { readonly kind: 'messages'; readonly messages: readonly TMessage[] };

export interface TuiEffect<TMessage> {
  readonly id: string;
  readonly concurrency: TuiEffectConcurrency;
  run(context: TuiEffectContext): Promise<TuiEffectOutput<TMessage>>;
  onError?(failure: TuiEffectFailure): TuiEffectOutput<TMessage>;
}

export interface TuiEffectPolicy {
  readonly maxActive: number;
  readonly maxActivePerId: number;
  readonly maxQueued: number;
  readonly maxQueuedPerId: number;
  readonly replacementGracePeriodMs: number;
}

export type TuiEffectConcurrency = 'parallel' | 'keep-first' | 'replace' | 'enqueue';

/** @beta */
export type TuiSourceEmission<TMessage> =
  | { readonly kind: 'reliable'; readonly message: TMessage }
  | { readonly kind: 'replaceable'; readonly key: string; readonly message: TMessage };

/** @beta */
export interface TuiSourceChannelPolicy {
  readonly capacity: number;
  readonly cadenceMs?: number;
}

/** @beta */
export type TuiSourceLifecycle =
  | { readonly kind: 'completed'; readonly id: string; readonly generation: string | number }
  | {
      readonly kind: 'failed';
      readonly id: string;
      readonly generation: string | number;
      readonly diagnostic: TerminalDiagnostic;
    };

/** @beta */
export interface TuiEventSource<TMessage> {
  readonly id: string;
  readonly generation: string | number;
  readonly source?: Exclude<TuiMessageSource, 'input' | 'effect'>;
  readonly channel?: TuiSourceChannelPolicy;
  run(context: TuiSubscriptionContext, sink: TuiSourceSink<TMessage>): void | Promise<void>;
  onLifecycle?(event: TuiSourceLifecycle): MessageResolution<TMessage>;
  dispose?(): void | Promise<void>;
}

/** @beta */
export interface TuiSourceSink<TMessage> {
  emit(emission: TuiSourceEmission<TMessage>): Promise<void>;
}

/** @beta */
export interface TuiSubscriptionContext extends TuiContext {
  readonly signal: AbortSignal;
}

export interface TuiExitRequest {
  readonly reason?: string;
}

/** @beta */
export type TuiSubscriptions<TState, TMessage> = (
  state: TState,
  context: TuiContext
) => readonly TuiEventSource<TMessage>[];
export type TuiExitHandler<TState> = (state: TState) => void | Promise<void>;

export type TuiTheme<TState> =
  | TerminalTheme
  | TerminalThemeDefinition
  | ((state: TState) => TerminalTheme | TerminalThemeDefinition);

export type TuiExit<TState> =
  | {
      readonly status: 'completed';
      readonly state: TState;
      readonly reason?: string;
      readonly diagnostics: readonly DiagnosticOccurrence[];
      readonly transcript?: InteractionTranscript;
      readonly snapshot: AccessibleSnapshot;
    }
  | {
      readonly status: 'cancelled' | 'interrupted';
      readonly state?: TState;
      readonly diagnostics: readonly DiagnosticOccurrence[];
      readonly transcript?: InteractionTranscript;
      readonly snapshot: AccessibleSnapshot;
    }
  | {
      readonly status: 'error';
      readonly state?: TState;
      readonly diagnostics: readonly DiagnosticOccurrence[];
      readonly transcript?: InteractionTranscript;
      readonly snapshot: AccessibleSnapshot;
    };

export interface TuiRuntimeOptions<TState, TMessage> {
  readonly app: TuiApp<TState, TMessage>;
  readonly host: TerminalHost;
  readonly graphics?: TerminalGraphicsMode;
  readonly graphicsBudget?: Partial<GraphicsBudgetLimits>;
  readonly initialFocus?: InitialFocusSelector;
  readonly theme?: TuiTheme<TState>;
  readonly transcript?: TranscriptRecorder;
  readonly input?: InputPipelineOptions;
  readonly diagnostics?: readonly TerminalDiagnostic[];
  readonly effectPolicy?: TuiEffectPolicy;
  readonly withTerminalSuspended?: <TValue>(
    operation: () => Promise<TValue>,
    signal: AbortSignal
  ) => Promise<TValue>;
}

export interface TuiRunOptions<TState = unknown> {
  readonly host?: TerminalHost;
  readonly initialFocus?: InitialFocusSelector;
  readonly theme?: TuiTheme<TState>;
  readonly sessionPolicy?: SessionProtocolPolicy;
  readonly lifecycle?: TuiLifecyclePolicy;
  readonly input?: TuiRunInputPolicy;
  readonly graphics?: TerminalGraphicsMode;
  readonly graphicsBudget?: Partial<GraphicsBudgetLimits>;
}

export interface TuiRunInputPolicy {
  readonly escapeDelayMs?: number;
}

export interface TuiLifecyclePolicy {
  readonly defaultTimeoutMs?: number;
  readonly startupTimeoutMs?: number;
  readonly inputRetirementTimeoutMs?: number;
  readonly runtimeDisposalTimeoutMs?: number;
  readonly exitHandlerTimeoutMs?: number;
  readonly restorationTimeoutMs?: number;
  readonly outputFlushTimeoutMs?: number;
  readonly hostDisposalTimeoutMs?: number;
}

export interface TuiRuntime<TState, TMessage> {
  start(): Promise<Frame>;
  dispatch(message: TMessage): Promise<TState>;
  dispatchMany(messages: readonly TMessage[]): Promise<TState>;
  copySelectedText(
    input: import('./selection.ts').CopySelectedTextInput,
  ): Promise<import('./selection.ts').CopySelectedTextResult>;
  resize(terminalSize: TerminalSize): Promise<Frame>;
  handleInput(event: InputEvent): Promise<TuiInputResult<TState>>;
  handleInputChunk(chunk: TerminalInputChunk): Promise<TuiInputBatchResult<TState>>;
  flushInput(): Promise<readonly TuiInputResult<TState>[]>;
  replaceTerminalProfile(options: InputPipelineOptions & { readonly capabilities: TerminalCapabilityProfile }): void;
  resetInput(): void;
  suspendOutput(): Promise<void>;
  resumeOutput(): void;
  redraw(): Promise<Frame>;
  nextChange(signal?: AbortSignal): Promise<TuiRuntimeChange<TState>>;
  dispose(options?: TuiRuntimeDisposeOptions): Promise<void>;
  state(): TState;
  frame(): Frame | undefined;
  exit(): TuiExit<TState> | undefined;
  diagnostics(): readonly DiagnosticOccurrence[];
  reportDiagnostic(diagnostic: TerminalDiagnostic): DiagnosticOccurrence;
  metrics(): TuiRuntimeMetrics;
}

export interface TuiRuntimeDisposeOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface TuiRuntimeMetrics {
  readonly decodedInputEvents: number;
  readonly wheelPackets: number;
  readonly dispatchedMessages: number;
  readonly frameCommits: number;
  readonly diagnostics: {
    readonly retained: number;
    readonly omitted: number;
  };
  readonly effects: {
    readonly active: number;
    readonly queued: number;
    readonly rejected: number;
  };
  readonly sources: TuiSourceChannelMetrics;
}

/** @beta */
export interface TuiSourceChannelMetrics {
  readonly reliableAdmissions: number;
  readonly replaceableAdmissions: number;
  readonly replacements: number;
  readonly dispatchedMessages: number;
  readonly dispatchedBatches: number;
  readonly maximumBuffered: number;
  readonly cadenceFlushes: number;
}

export interface TuiInputBatchResult<TState> {
  readonly results: readonly TuiInputResult<TState>[];
  readonly pending?: Promise<readonly TuiInputResult<TState>[]>;
}

export type TuiRuntimeChange<TState> =
  | { readonly kind: 'frame'; readonly commitId: string; readonly stateVersion: number; readonly frame: Frame }
  | { readonly kind: 'exit'; readonly exit: TuiExit<TState> };

export interface TuiInputResult<TState> {
  readonly handled: boolean;
  readonly state: TState;
  readonly frame: Frame;
  readonly exit?: TuiExit<TState>;
}
