import type { TerminalInputChunk, TerminalSize } from '../host/index.ts';
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

export const keyEventTypes = ['press', 'repeat', 'release'] as const;
export type KeyEventType = typeof keyEventTypes[number];

export const keyLocations = ['standard', 'numpad', 'unknown'] as const;
export type KeyLocation = typeof keyLocations[number];

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

interface MouseEventBase<TButton extends MouseButton> {
  readonly kind: 'mouse';
  readonly sequence: string;
  readonly encoding: MouseEncoding;
  readonly button: TButton;
  readonly row: number;
  readonly column: number;
  readonly rawCode: number;
  readonly modifiers: MouseModifiers;
}

export type MouseEvent = MousePointerEvent | MouseWheelEvent;

export interface MousePointerEvent extends MouseEventBase<MousePointerButton> {
  readonly action: Exclude<MouseAction, 'wheel'>;
}

export interface MouseWheelEvent extends MouseEventBase<MouseWheelButton> {
  readonly action: 'wheel';
  readonly deltaRows: number;
  readonly deltaColumns: number;
}

export const mouseEncodings = ['sgr', 'x10'] as const;
export type MouseEncoding = typeof mouseEncodings[number];

export const mouseActions = ['press', 'release', 'drag', 'move', 'wheel'] as const;
export type MouseAction = typeof mouseActions[number];

export const mousePointerButtons = ['left', 'middle', 'right', 'none', 'unknown'] as const;
export type MousePointerButton = typeof mousePointerButtons[number];

export const mouseWheelButtons = ['wheelUp', 'wheelDown', 'wheelLeft', 'wheelRight', 'unknown'] as const;
export type MouseWheelButton = typeof mouseWheelButtons[number];

export const mouseButtons = [
  'left',
  'middle',
  'right',
  'wheelUp',
  'wheelDown',
  'wheelLeft',
  'wheelRight',
  'none',
  'unknown'
] as const;
export type MouseButton = typeof mouseButtons[number];

export interface MouseModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

export interface ResizeEvent {
  readonly kind: 'resize';
  readonly terminalSize: TerminalSize;
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

export const letterKeyNames = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
] as const;
export type LetterKeyName = typeof letterKeyNames[number];

export const digitKeyNames = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type DigitKeyName = typeof digitKeyNames[number];

export const functionKeyNames = [
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'
] as const;
export type FunctionKeyName = typeof functionKeyNames[number];

export const specialKeyNames = [
  'enter',
  'escape',
  'tab',
  'backspace',
  'delete',
  'arrowUp',
  'arrowDown',
  'arrowLeft',
  'arrowRight',
  'pageUp',
  'pageDown',
  'home',
  'end',
  'insert',
  'space',
  'add',
  'subtract',
  'multiply',
  'divide',
  'decimal',
  'equal',
  'unknown'
] as const;
export type SpecialKeyName = typeof specialKeyNames[number];

export const keyNames = [
  ...letterKeyNames,
  ...digitKeyNames,
  ...functionKeyNames,
  ...specialKeyNames
] as const;
export type KeyName = typeof keyNames[number];

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
