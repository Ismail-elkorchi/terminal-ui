import type { TerminalInputChunk, TerminalViewport } from '../host/index.ts';

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
  readonly sequence?: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly repeat?: boolean;
}

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

export interface MouseEvent {
  readonly kind: 'mouse';
  readonly sequence: string;
  readonly encoding: MouseEncoding;
  readonly action: MouseAction;
  readonly button: MouseButton;
  readonly row: number;
  readonly column: number;
  readonly rawCode: number;
  readonly modifiers: MouseModifiers;
}

export type MouseEncoding = 'sgr' | 'x10';
export type MouseAction = 'press' | 'release' | 'drag' | 'move' | 'wheel';
export type MouseButton = 'left' | 'middle' | 'right' | 'wheelUp' | 'wheelDown' | 'none' | 'unknown';

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

export type KeyName =
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
  | 'space'
  | 'ctrlC'
  | 'ctrlD'
  | 'unknown';

export interface InputDecodeOptions {
  readonly bracketedPaste?: boolean;
}

export type KeyEventLike = Partial<KeyEvent> & { readonly key: KeyName };

export interface InputDecoder {
  decode(chunk: TerminalInputChunk): readonly InputEvent[];
  flush(): readonly InputEvent[];
  reset(): void;
}
