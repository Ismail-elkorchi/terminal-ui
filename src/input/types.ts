import type { TerminalInputChunk, TerminalViewport } from '../host/index.ts';
import type { TerminalKeyboardProfile } from '../protocol/index.ts';

export type InputEvent =
  | KeyEvent
  | TextInputEvent
  | PasteEvent
  | MouseEvent
  | ResizeEvent
  | FocusEvent
  | SignalEvent
  | EndOfInputEvent
  | UnknownInputEvent;

export interface KeyEvent {
  readonly kind: 'key';
  readonly key: KeyName;
  readonly keyCodePoint?: number;
  readonly sequence?: string;
  readonly modifiers: KeyModifiers;
  readonly eventType: KeyEventType;
  readonly location: KeyLocation;
  readonly alternateCodePoints?: KeyAlternateCodePoints;
  readonly committedText?: string;
}

export interface KeyAlternateCodePoints {
  readonly shifted?: number;
  readonly baseLayout?: number;
}

export interface KeyModifiers {
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

export type KeyEventType = 'press' | 'repeat' | 'release';
export type KeyLocation = 'standard' | 'numpad' | 'unknown';

export interface TextInputEvent {
  readonly kind: 'text';
  readonly text: string;
  readonly paste: false;
}

export interface PasteEvent {
  readonly kind: 'paste';
  readonly text: string;
  readonly bracketed: boolean;
}

interface MouseEventBase {
  readonly kind: 'mouse';
  readonly sequence: string;
  readonly encoding: MouseEncoding;
  readonly button: MouseButton;
  readonly row: number;
  readonly column: number;
  readonly rawCode: number;
  readonly modifiers: MouseModifiers;
}

export type MouseEvent = MousePointerEvent | MouseWheelEvent;

export interface MousePointerEvent extends MouseEventBase {
  readonly action: Exclude<MouseAction, 'wheel'>;
}

export interface MouseWheelEvent extends MouseEventBase {
  readonly action: 'wheel';
  readonly button: 'wheelUp' | 'wheelDown' | 'wheelLeft' | 'wheelRight' | 'unknown';
  readonly deltaRows: number;
  readonly deltaColumns: number;
}

export type MouseEncoding = 'sgr' | 'x10';
export type MouseAction = 'press' | 'release' | 'drag' | 'move' | 'wheel';
export type MouseButton =
  | 'left'
  | 'middle'
  | 'right'
  | 'wheelUp'
  | 'wheelDown'
  | 'wheelLeft'
  | 'wheelRight'
  | 'none'
  | 'unknown';

export interface MouseModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

export interface ResizeEvent {
  readonly kind: 'resize';
  readonly viewport: TerminalViewport;
}

export interface FocusEvent {
  readonly kind: 'focus';
  readonly focused: boolean;
}

export interface SignalEvent {
  readonly kind: 'signal';
  readonly signal: string;
}

export interface EndOfInputEvent {
  readonly kind: 'end';
}

export interface UnknownInputEvent {
  readonly kind: 'unknown';
  readonly sequence: string;
}

export type KeyName = LetterKeyName | DigitKeyName | FunctionKeyName | SpecialKeyName;

export type LetterKeyName =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i'
  | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r'
  | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

export type DigitKeyName = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type FunctionKeyName =
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6'
  | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12';

export type SpecialKeyName =
  | 'enter'
  | 'escape'
  | 'tab'
  | 'backspace'
  | 'delete'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight'
  | 'pageUp'
  | 'pageDown'
  | 'home'
  | 'end'
  | 'insert'
  | 'space'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'decimal'
  | 'equal'
  | 'unknown';

export type BindableKeyName = Exclude<KeyName, 'unknown'>;

export type InputTrigger =
  | {
      readonly kind: 'key';
      readonly key: BindableKeyName;
      readonly modifiers?: KeyModifierTrigger;
      readonly eventType?: KeyEventType;
      readonly location?: KeyLocation;
    }
  | {
      readonly kind: 'codePoint';
      readonly codePoint: number;
      readonly source?: 'primary' | 'shifted';
      readonly modifiers?: KeyModifierTrigger;
      readonly eventType?: KeyEventType;
      readonly location?: KeyLocation;
    }
  | {
      /** Kitty's base-layout code point identifies the physical key position. */
      readonly kind: 'physicalKey';
      readonly codePoint: number;
      readonly modifiers?: KeyModifierTrigger;
      readonly eventType?: KeyEventType;
      readonly location?: KeyLocation;
    }
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'focus';
      readonly focused: boolean;
    };

export interface InputDecodeOptions {
  readonly bracketedPaste?: boolean;
  readonly keyboard?: TerminalKeyboardProfile;
  readonly limits?: Partial<InputDecodeLimits>;
}

export interface InputDecodeLimits {
  readonly maxPendingSequenceCodeUnits: number;
  readonly maxPasteCodeUnits: number;
}

export type KeyModifierTrigger =
  | { readonly kind: 'any' }
  | {
      readonly kind?: 'exact';
      readonly ctrl?: boolean;
      readonly alt?: boolean;
      readonly shift?: boolean;
      readonly meta?: boolean;
    };

export interface KeyEventLike {
  readonly key: KeyName;
  readonly keyCodePoint?: number;
  readonly sequence?: string;
  readonly modifiers?: Partial<KeyModifiers>;
  readonly eventType?: KeyEventType;
  readonly location?: KeyLocation;
  readonly alternateCodePoints?: KeyAlternateCodePoints;
  readonly committedText?: string;
}

export interface InputDecoder {
  decode(chunk: TerminalInputChunk): InputDecoderBatch;
  flush(): InputDecoderBatch;
  reset(): void;
}

export interface InputDecoderBatch {
  readonly events: readonly InputEvent[];
  readonly pending: InputPendingState;
}

export type InputPendingState =
  | { readonly kind: 'none' }
  | { readonly kind: 'escape' }
  | { readonly kind: 'sequence' };
