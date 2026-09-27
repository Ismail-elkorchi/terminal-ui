import type { ComponentMessage } from '../../component/message.ts';
import {
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
} from '../../component/scrollbar.ts';
import { isNonArrayObject, isStringMember } from '../../foundation/validation.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextDocument } from '../../text/document.ts';
import {
  assertTextDocument,
  normalizeTextCaret,
  normalizeTextDocumentSelection,
} from '../../text/document.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import type { TextCaret, TextDocumentSelection } from '../../text/types.ts';
import type { TextAreaLineNumberOptions, TextAreaWrapOptions } from './contracts.ts';
import {
  emptyTextAreaDecorations,
  readTextAreaDecorations,
  type TextAreaDecorations,
} from './decorations.ts';
import type { TextAreaOptions } from './options.ts';


export interface TextAreaModel {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly placeholder: string;
  readonly selection?: TextDocumentSelection;
  readonly decorations: TextAreaDecorations;
  readonly lineNumbers?: { readonly startNumber: number; readonly minWidth: number };
  readonly highlightActiveLine: boolean;
  readonly wrap: boolean;
  readonly revealCaret: boolean;
  readonly required: boolean;
  readonly error: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export function createTextAreaModel(
  value: Readonly<Omit<TextAreaOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'>>,
): TextAreaModel {
  if (!isNonArrayObject(value.state)) {
    throw new TypeError('textArea state must be an object.');
  }
  const state = value.state;
  const document = state.document;
  assertTextDocument(document);
  const caret = state.caret;
  if (!isNonArrayObject(caret) || !isNonArrayObject(caret.position)) {
    throw new TypeError('textArea caret must contain a position object.');
  }
  const position = caret.position;
  const offset = position.offset;
  const affinity = position.affinity;
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('textArea caret position offset must be a non-negative safe integer.');
  }
  if (!isStringMember(affinity, ['upstream', 'downstream'])) {
    throw new TypeError('textArea caret position affinity is invalid.');
  }
  const preferredColumnCells = caret.preferredColumnCells;
  if (
    preferredColumnCells !== undefined &&
    (typeof preferredColumnCells !== 'number' ||
      !Number.isSafeInteger(preferredColumnCells) ||
      preferredColumnCells < 0)
  ) {
    throw new RangeError(
      'textArea caret preferredColumnCells must be a non-negative safe integer.',
    );
  }
  const decodedCaret: TextCaret = {
    position: { offset, affinity },
    ...(preferredColumnCells === undefined ? {} : { preferredColumnCells }),
  };
  const normalizedCaret = normalizeTextCaret(document, decodedCaret);
  let selection: TextDocumentSelection | undefined;
  if (state.selection !== undefined) {
    const candidate = state.selection;
    if (!isNonArrayObject(candidate)) {
      throw new TypeError('textArea selection must contain anchor and focus positions.');
    }
    selection = normalizeTextDocumentSelection(document, {
      anchor: decodeTextPosition(candidate.anchor, 'textArea selection.anchor'),
      focus: decodeTextPosition(candidate.focus, 'textArea selection.focus'),
    });
  }
  const decorations = textAreaDecorationsForDocument(value.decorations, document);
  const scroll = decodeComponentScrollState(state.scroll, 'textArea scroll');
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'textArea scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'textArea scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('textArea scrollbar and scrollPolicy require scroll state.');
  }
  const lineNumbers = decodeLineNumbers(value.lineNumbers);
  const highlightActiveLine = booleanOption(
    value.highlightActiveLine,
    'textArea highlightActiveLine',
  );
  const wrap = decodeWrap(value.wrap);
  const required = booleanOption(value.required, 'textArea required');
  const revealCaret = booleanOption(state.revealCaret, 'textArea revealCaret');
  return {
    document,
    caret: normalizedCaret,
    ...(selection === undefined ? {} : { selection }),
    decorations,
    placeholder: textOption(value.placeholder, 'textArea placeholder') ?? '',
    ...(lineNumbers === undefined ? {} : { lineNumbers }),
    highlightActiveLine,
    wrap,
    revealCaret,
    required,
    error: textOption(value.error, 'textArea error') ?? '',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

export function textAreaDecorationsForDocument(
  decorations: TextAreaDecorations | undefined,
  document: TextDocument,
): TextAreaDecorations {
  const value = decorations ?? emptyTextAreaDecorations(document);
  if (readTextAreaDecorations(value).document !== document) {
    throw new TypeError('Text area decorations must be created for the current text document.');
  }
  return value;
}

function decodeTextPosition(value: TextCaret['position'], owner: string): TextCaret['position'] {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${owner} must contain offset and affinity.`);
  }
  const offset = value.offset;
  const affinity = value.affinity;
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError(`${owner}.offset must be a non-negative safe integer.`);
  }
  if (!isStringMember(affinity, ['upstream', 'downstream'])) {
    throw new TypeError(`${owner}.affinity is invalid.`);
  }
  return { offset, affinity };
}

export function decodeLineNumbers(
  value: boolean | TextAreaLineNumberOptions | undefined,
): { readonly startNumber: number; readonly minWidth: number } | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return Object.freeze({ startNumber: 1, minWidth: 1 });
  if (!isNonArrayObject(value)) {
    throw new TypeError('textArea lineNumbers must be a boolean or line-number options.');
  }
  const startNumber = value['startNumber'] === undefined ? 1 : value['startNumber'];
  const minWidth = value['minWidth'] === undefined ? 1 : value['minWidth'];
  if (typeof startNumber !== 'number' || !Number.isSafeInteger(startNumber)) {
    throw new RangeError('textArea lineNumbers.startNumber must be a safe integer.');
  }
  if (typeof minWidth !== 'number' || !Number.isSafeInteger(minWidth) || minWidth < 1) {
    throw new RangeError('textArea lineNumbers.minWidth must be a positive safe integer.');
  }
  return Object.freeze({ startNumber, minWidth });
}

export function decodeWrap(value: boolean | TextAreaWrapOptions | undefined): boolean {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  if (
    !isNonArrayObject(value) ||
    (value['mode'] !== undefined && value['mode'] !== 'none' && value['mode'] !== 'soft')
  ) {
    throw new TypeError('textArea wrap must be a boolean or wrap options.');
  }
  return value['mode'] !== 'none';
}

function textOption(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text;
}

function booleanOption(value: unknown, owner: string): boolean {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  throw new TypeError(`${owner} must be a boolean.`);
}
