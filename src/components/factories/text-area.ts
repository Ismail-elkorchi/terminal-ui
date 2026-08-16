import {
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
  prepareTerminalStyle,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { Measurement } from '../../renderer/index.ts';
import {
  assertOptionalCallback,
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionAction } from '../../interaction/pointer-interaction.ts';
import { preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import {
  assertTextDocument,
  createTerminalTextIndex,
  measureTextCells,
  normalizeTextCaret,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelectionModel,
  prepareTextDocument,
  sanitizeTerminalText,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentParentChange,
  textDocumentSelectionRange,
  textDocumentText,
  textWidthProfileKey,
} from '../../text/index.ts';
import type {
  TerminalTextIndex,
  TextCaret,
  TextDocument,
  TextDocumentSelection,
  TextSelection,
  TextWidthProfile,
} from '../../text/index.ts';
import type { TextAreaAction } from '../../ui-model/text-area.ts';
import type {
  TextAreaHighlight,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions,
} from '../../ui-model/content.ts';
import type { TextAreaStylePart } from '../../ui-model/style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render.ts';
import type { ScrollableTextAreaOptions, TextAreaOptions } from '../options/content.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';
import { inspectTextDocumentValue, inspectValidation } from '../internal/inspection.ts';

interface TextAreaModel {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly placeholder: string;
  readonly selection?: TextDocumentSelection;
  readonly highlights: readonly PreparedTextAreaHighlight[];
  readonly lineNumbers?: { readonly startNumber: number; readonly minWidth: number };
  readonly activeLine: boolean;
  readonly wrap: boolean;
  readonly revealCaret: boolean;
  readonly required: boolean;
  readonly error: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

interface PreparedTextAreaHighlight extends TextAreaHighlight {
  readonly label: string;
}

type TextAreaComponentAction = TextAreaAction | {
  readonly kind: 'pointerLifecycle';
  readonly action: PointerInteractionAction;
};

type TextAreaFactory = <const TMessage extends ComponentMessage = never>(
  options: TextAreaOptions<TMessage>,
) => Element<TMessage>;

const instantiateTextArea = defineComponent<
  Omit<TextAreaOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onAction' | 'onPointerAction' | 'meta'>,
  TextAreaModel,
  TextAreaComponentAction,
  TextAreaStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/text-area',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'textbox',
  states: ['disabled', 'readOnly'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'border',
    'label',
    'value',
    'placeholder',
    'selection',
    'cursor',
    'error',
    'gutter',
    'lineNumber',
    'activeLine',
    'highlight',
    'scrollbar',
  ],
  prepare: (value, context) => prepareTextArea(value, !context.disabled && !context.inert),
  inspection: ({ model }) => ({
    value: inspectTextDocumentValue(model.document),
    validation: inspectValidation(model.required, model.error),
  }),
  measure: measureTextArea,
  render: paintTextArea,
  keys: ({ readOnly }) => ({
    triggers: [
      ...textEditingTriggers(readOnly, true),
      ...(readOnly ? [] : textAreaHistoryTriggers())
    ],
    ...(readOnly ? {} : {
      backspace: () => edit('deleteBackward'),
      delete: () => edit('deleteForward'),
      enter: () => ({ kind: 'edit' as const, operation: { kind: 'insert' as const, text: '\n' } }),
    }),
    arrowLeft: () => edit('moveLeft'),
    arrowRight: () => edit('moveRight'),
    arrowUp: () => edit('moveLineUp'),
    arrowDown: () => edit('moveLineDown'),
    pageUp: () => edit('movePageUp'),
    pageDown: () => edit('movePageDown'),
    home: () => edit('moveHome'),
    end: () => edit('moveEnd'),
  }),
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
  focusTargets(input) {
    const geometry = textAreaGeometry(input);
    const caret = textAreaCursorInLayout(geometry.layout, input.model.caret);
    const row = caret.rowIndex - geometry.scrollbar.scroll.offsetRow;
    const column = geometry.prefixWidth +
      caret.columnCells -
      geometry.scrollbar.scroll.offsetColumn;
    const cursorStyle = input.style({
      part: 'cursor',
      state: 'focused',
      base: {
        fg: { kind: 'theme', token: 'input.cursor' },
        bold: true,
        inverse: true,
      },
    });
    return [{
      id: 'self',
      bounds: input.bounds,
      ...(row < 0 || row >= geometry.scrollbar.contentBounds.height ? {} : {
        cursor: {
          row,
          column: Math.max(
            0,
            Math.min(
              Math.max(0, input.bounds.width - 1),
              column,
            ),
          ),
          ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
          source: input.source({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
        },
      }),
    }];
  },
  hitTargets(input) {
    const geometry = textAreaGeometry(input);
    return [
      {
        id: `${input.id ?? 'text-area'}:text`,
        bounds: geometry.scrollbar.contentBounds,
        cursor: 'text',
        focus: { kind: 'target', targetId: 'self' },
        accepts: ['pointerDown', 'dragStart', 'drag', 'dragEnd'],
        message(event) {
          const offset = pointerOffset(
            input,
            event.localRow ?? event.row,
            event.localColumn ?? event.column,
          );
          if (event.kind === 'pointerDown') {
            return { kind: 'pointer', action: { kind: 'placeCaret', offset } };
          }
          if (event.kind !== 'dragStart' && event.kind !== 'drag' && event.kind !== 'dragEnd') {
            return ignoreMessage();
          }
          const anchor = pointerOffset(
            input,
            event.pressLocalRow ?? event.localRow ?? event.row,
            event.pressLocalColumn ?? event.localColumn ?? event.column,
          );
          return {
            kind: 'pointer',
            action: {
              kind: event.kind === 'dragEnd' ? 'endSelection' : 'extendSelection',
              anchor,
              offset,
            },
          };
        },
      },
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<TextAreaComponentAction>({
        id: input.id ?? 'text-area',
        plan: geometry.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => ({ kind: 'scroll', event }),
      })),
    ];
  },
  accessibility(input) {
    const { id, model, focused } = input;
    const value = textDocumentText(model.document);
    const geometry = textAreaGeometry(input);
    const scroll = geometry.scrollbar.scroll;
    const scrollGeometry = geometry.scrollbar.geometry;
    const visibleRows = Math.min(scrollGeometry.contentRows, scrollGeometry.viewportRows);
    const start = visibleRows === 0 ? 0 : scroll.offsetRow + 1;
    const end = visibleRows === 0
      ? 0
      : Math.min(scrollGeometry.contentRows, scroll.offsetRow + visibleRows);
    const logicalLines = textDocumentLength(model.document) === 0
      ? 0
      : textDocumentLineCount(model.document);
    const description = `${String(logicalLines)} lines. Showing ${String(start)}-${
      String(end)
    } of ${String(scrollGeometry.contentRows)} rows. Omitted before: ${
      String(scroll.offsetRow)
    }. Omitted after: ${String(Math.max(0, scrollGeometry.contentRows - end))}. Horizontal offset: ${
      String(scroll.offsetColumn)
    }.${model.selection === undefined ? '' : ' Selection active.'}${
      model.required ? ' Required.' : ''
    }${model.error === '' ? '' : ` ${model.error}`}`;
    return {
      id,
      role: 'textbox',
      label: id,
      value,
      description,
      required: model.required,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(focused ? { focused: true } : {}),
    };
  },
});

export const textArea: TextAreaFactory = (options) => {
  if (options.disabled === true) return instantiateTextArea(options);
  assertRequiredCallback(options.onAction, 'textArea onAction');
  assertOptionalCallback(options.onPointerAction, 'textArea onPointerAction');
  if (!isScrollableTextArea(options)) {
    const { onAction, onPointerAction, ...componentOptions } = options;
    return instantiateTextArea({
      ...componentOptions,
      onAction: (action) => action.kind === 'pointerLifecycle'
        ? onPointerAction?.(action.action) ?? ignoreMessage()
        : action.kind === 'scroll' ? ignoreMessage() : onAction(action),
    });
  }
  const { onAction, onPointerAction, ...componentOptions } = options;
  return instantiateTextArea({
    ...componentOptions,
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? onPointerAction?.(action.action) ?? ignoreMessage()
      : onAction(action),
  });
};

function isScrollableTextArea<TMessage extends ComponentMessage>(
  options: Exclude<TextAreaOptions<TMessage>, { readonly disabled: true }>,
): options is ScrollableTextAreaOptions<TMessage> {
  return hasScrollState(options.presentation);
}

function hasScrollState(value: unknown): boolean {
  return isNonArrayObject(value) && Reflect.get(value, 'scroll') !== undefined;
}

function prepareTextArea(
  value: Readonly<Omit<TextAreaOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onAction' | 'onPointerAction' | 'meta'>>,
  pointerAvailable: boolean,
): TextAreaModel {
  if (!isNonArrayObject(value.presentation)) {
    throw new TypeError('textArea presentation must be an object.');
  }
  const presentation = value.presentation;
  const document = presentation.document;
  assertTextDocument(document);
  const caret = presentation.caret;
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
  if (presentation.selection !== undefined) {
    const candidate = presentation.selection;
    if (!isNonArrayObject(candidate)) {
      throw new TypeError('textArea selection must contain anchor and focus positions.');
    }
    selection = normalizeTextDocumentSelectionModel(document, {
      anchor: prepareTextPosition(candidate.anchor, 'textArea selection.anchor'),
      focus: prepareTextPosition(candidate.focus, 'textArea selection.focus'),
    });
  }
  const highlights = prepareTextAreaHighlights(value.highlights, document);
  const scroll = prepareComponentScrollState(presentation.scroll, 'textArea scroll');
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'textArea scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value.scrollPolicy, 'textArea scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('textArea scrollbar and scrollPolicy require scroll state.');
  }
  const lineNumbers = prepareLineNumbers(value.lineNumbers);
  const activeLine = booleanOption(value.activeLine, 'textArea activeLine');
  const wrap = prepareWrap(value.wrap);
  const required = booleanOption(value.required, 'textArea required');
  const revealCaret = booleanOption(presentation.revealCaret, 'textArea revealCaret');
  const pointerState = preparePointerInteractionState(
    value.pointerState,
    'textArea pointerState',
    pointerAvailable,
  );
  return {
    document,
    caret: normalizedCaret,
    ...(selection === undefined ? {} : { selection }),
    highlights,
    placeholder: textOption(value.placeholder, 'textArea placeholder') ?? '',
    ...(lineNumbers === undefined ? {} : { lineNumbers }),
    activeLine,
    wrap,
    revealCaret,
    required,
    error: textOption(value.error, 'textArea error') ?? '',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function measureTextArea(input: ComponentMeasureInput<TextAreaModel>): Measurement {
  const document = textAreaDisplayDocument(input.model).document;
  const count = textDocumentLineCount(document);
  const prefix = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, count);
  const width = Math.max(0, input.constraints.width - prefix);
  const layout = layoutTextAreaDocument(document, width, input.model.wrap, input.widthProfile);
  return {
    minWidth: prefix,
    minHeight: 1,
    preferredWidth: layout.intrinsicColumns + prefix,
    preferredHeight: layout.contentRows,
  };
}

interface TextAreaGeometry {
  readonly document: TextDocument;
  readonly usesPlaceholder: boolean;
  readonly lineCount: number;
  readonly prefixWidth: number;
  readonly layout: TextAreaDocumentLayout;
  readonly scrollbar: ReturnType<typeof prepareComponentScrollbar>;
}

function textAreaGeometry(input: ComponentInput<TextAreaModel>): TextAreaGeometry {
  const display = textAreaDisplayDocument(input.model);
  const lineCount = textDocumentLineCount(display.document);
  const prefixWidth = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, lineCount);
  let frameWidth = Math.max(0, input.bounds.width - prefixWidth);
  let layout = layoutTextAreaDocument(
    display.document,
    frameWidth,
    input.model.wrap,
    input.widthProfile,
  );
  let scrollbar = textAreaScrollbar(input, layout, prefixWidth);
  if (scrollbar.contentBounds.width !== frameWidth) {
    frameWidth = scrollbar.contentBounds.width;
    layout = layoutTextAreaDocument(
      display.document,
      frameWidth,
      input.model.wrap,
      input.widthProfile,
    );
    scrollbar = textAreaScrollbar(input, layout, prefixWidth);
  }
  return {
    document: display.document,
    usesPlaceholder: display.usesPlaceholder,
    lineCount,
    prefixWidth,
    layout,
    scrollbar,
  };
}

function paintTextArea(input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>): void {
  const geometry = textAreaGeometry(input);
  const content = geometry.scrollbar.contentBounds;
  const active = textDocumentLineIndexAtOffset(
    input.model.document,
    input.model.caret.position.offset,
  );
  const selection = geometry.usesPlaceholder || input.model.selection === undefined
    ? undefined
    : textDocumentSelectionRange(input.model.document, input.model.selection, input.model.caret);
  for (let visibleRow = 0; visibleRow < content.height; visibleRow += 1) {
    const rowIndex = geometry.scrollbar.scroll.offsetRow + visibleRow;
    const line = geometry.layout.lines[rowIndex];
    if (line === undefined) break;
    const isActive = input.model.activeLine && line.logicalLineIndex === active;
    const prefix = textAreaPrefixSpans(input, geometry, line, visibleRow, isActive);
    const window = visibleTextWindow(
      line,
      geometry.scrollbar.scroll.offsetColumn,
      content.width,
    );
    const valueSpans = textAreaValueSpans(input, geometry, line, window, selection, isActive);
    const occupied = valueSpans.reduce(
      (total, current) =>
        total + measureTextCells(current.text, { widthProfile: input.widthProfile }).cells,
      0,
    );
    const activeFillStyle = input.style({
      part: 'activeLine',
      base: { bg: { kind: 'theme', token: 'editor.activeLine.background' } },
    });
    const fill = isActive && occupied < content.width
      ? [span(' '.repeat(Math.max(0, content.width - occupied)), {
        ...(activeFillStyle === undefined ? {} : { style: activeFillStyle }),
        source: input.source({
          cellRole: 'content',
          partName: 'activeLine',
          partType: 'activeLine',
          description: 'activeLine.background',
        }),
      })]
      : [];
    input.target.write(visibleRow, 0, prefix);
    input.target.write(visibleRow, geometry.prefixWidth, [...valueSpans, ...fill]);
  }
  paintComponentScrollbar({
    target: input.target,
    plan: geometry.scrollbar,
    theme: input.theme,
    source: (sourceInput) => input.source(sourceInput),
  });
}

function pointerOffset(input: ComponentInput<TextAreaModel>, row: number, column: number): number {
  const geometry = textAreaGeometry(input);
  const rowIndex = Math.max(
    0,
    Math.min(
      geometry.layout.lines.length - 1,
      geometry.scrollbar.scroll.offsetRow + row - 1,
    ),
  );
  const line = geometry.layout.lines[rowIndex];
  if (line === undefined) return textDocumentLength(input.model.document);
  const visualColumn = Math.max(
    0,
    column - 1 - geometry.prefixWidth + geometry.scrollbar.scroll.offsetColumn,
  );
  const grapheme = line.index.visualColumnToGraphemeIndex(visualColumn);
  return normalizeTextDocumentOffset(
    input.model.document,
    line.start + line.index.graphemeIndexToCodeUnitOffset(grapheme),
  );
}

function prepareTextPosition(value: TextCaret['position'], owner: string): TextCaret['position'] {
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

function prepareTextAreaHighlights(
  value: readonly TextAreaHighlight[] | undefined,
  document: TextDocument,
): readonly PreparedTextAreaHighlight[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError('textArea highlights must be an array.');
  return Object.freeze(value.map((candidate, index) => {
    if (!isNonArrayObject(candidate)) {
      throw new TypeError(`textArea highlights[${String(index)}] is invalid.`);
    }
    const startOffset = candidate['startOffset'];
    const endOffsetExclusive = candidate['endOffsetExclusive'];
    if (
      typeof startOffset !== 'number' ||
      typeof endOffsetExclusive !== 'number' ||
      !Number.isSafeInteger(startOffset) ||
      !Number.isSafeInteger(endOffsetExclusive) ||
      startOffset < 0 ||
      endOffsetExclusive <= startOffset ||
      endOffsetExclusive > textDocumentLength(document)
    ) {
      throw new RangeError(`textArea highlights[${String(index)}] range is invalid.`);
    }
    const label = textOption(candidate['label'], `textArea highlights[${String(index)}].label`) ??
      `highlight.${String(index)}`;
    const style = candidate['style'] === undefined
      ? undefined
      : prepareTerminalStyle(candidate['style'], `textArea highlights[${String(index)}].style`);
    return Object.freeze({
      startOffset: normalizeTextDocumentOffset(document, startOffset),
      endOffsetExclusive: normalizeTextDocumentOffset(document, endOffsetExclusive),
      label,
      ...(style === undefined ? {} : { style }),
    });
  }));
}

function prepareLineNumbers(
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

function prepareWrap(value: boolean | TextAreaWrapOptions | undefined): boolean {
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

function textAreaDisplayDocument(model: TextAreaModel): {
  readonly document: TextDocument;
  readonly usesPlaceholder: boolean;
} {
  const usesPlaceholder = textDocumentLength(model.document) === 0 && model.placeholder !== '';
  return {
    document: usesPlaceholder ? prepareTextDocument(model.placeholder) : model.document,
    usesPlaceholder,
  };
}

function textAreaScrollbar(
  input: ComponentInput<TextAreaModel>,
  layout: TextAreaDocumentLayout,
  prefixWidth: number,
) {
  const raw = input.model.scroll;
  return prepareComponentScrollbar({
    bounds: {
      row: input.bounds.row,
      column: input.bounds.column + prefixWidth,
      width: Math.max(0, input.bounds.width - prefixWidth),
      height: input.bounds.height,
    },
    scroll: {
      offsetRow: raw?.offsetRow ?? 0,
      offsetColumn: raw?.offsetColumn ?? 0,
      followTail: raw?.followTail ?? false,
    },
    contentRows: layout.contentRows,
    contentColumns: layout.contentColumns,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'both',
  });
}

function textAreaPrefixWidth(
  model: TextAreaModel,
  theme: ComponentInput<TextAreaModel>['theme'],
  widthProfile: TextWidthProfile,
  lineCount: number,
): number {
  const numbers = model.lineNumbers;
  if (numbers === undefined) {
    return measureTextCells(`${theme.tokens.symbols.borderSingle.vertical} `, { widthProfile })
      .cells;
  }
  const width = Math.max(
    numbers.minWidth,
    String(numbers.startNumber + Math.max(0, lineCount - 1)).length,
  );
  return 1 + width +
    measureTextCells(` ${theme.tokens.symbols.borderSingle.vertical} `, { widthProfile }).cells;
}

function textAreaPrefixSpans(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  geometry: TextAreaGeometry,
  line: TextAreaLayoutLine,
  visibleRow: number,
  active: boolean,
): readonly RenderSpan[] {
  const marker = active
    ? input.focus === 'self'
      ? input.theme.tokens.symbols.pointer
      : input.theme.tokens.symbols.selected
    : visibleRow === 0
    ? input.disabled
      ? ' '
      : input.model.error !== ''
      ? input.theme.tokens.symbols.statusError
      : input.focus === 'self'
      ? input.theme.tokens.symbols.pointer
      : input.theme.tokens.colors['control.background'] === undefined
      ? input.theme.tokens.symbols.borderSingle.vertical
      : ' '
    : input.theme.tokens.symbols.borderSingle.vertical;
  const markerStyle = input.style({
    part: active ? 'activeLine' : 'gutter',
    base: active
      ? {
        fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
        bg: { kind: 'theme', token: 'editor.activeLine.background' },
        bold: true,
      }
      : {
        fg: {
          kind: 'theme',
          token: input.model.error !== '' ? 'status.error' : 'editor.gutter.foreground',
        },
        bg: { kind: 'theme', token: 'editor.gutter.background' },
      },
    ...(input.disabled ? { state: 'disabled' as const } : {}),
  });
  if (input.model.lineNumbers === undefined) {
    return [span(`${marker} `, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.source({
        cellRole: 'decoration',
        partName: active ? 'activeLine' : 'gutter',
        partType: active ? 'activeLine' : 'gutter',
        description: active ? 'activeLine.gutter' : 'gutter.prefix',
      }),
    })];
  }
  const numbers = input.model.lineNumbers;
  const width = Math.max(
    numbers.minWidth,
    String(numbers.startNumber + Math.max(0, geometry.lineCount - 1)).length,
  );
  const lineNumber = line.firstVisualLine
    ? String(numbers.startNumber + line.logicalLineIndex).padStart(width, ' ')
    : ''.padStart(width, ' ');
  const lineNumberStyle = input.style({
    part: 'lineNumber',
    base: active
      ? {
        fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
        bg: { kind: 'theme', token: 'editor.activeLine.background' },
        bold: true,
      }
      : {
        fg: { kind: 'theme', token: 'editor.gutter.foreground' },
        bg: { kind: 'theme', token: 'editor.gutter.background' },
      },
  });
  return [
    span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.source({
        cellRole: 'decoration',
        partName: active ? 'activeLine' : 'gutter',
        partType: 'marker',
        description: active ? 'activeLine.marker' : 'gutter.marker',
      }),
    }),
    span(lineNumber, {
      ...(lineNumberStyle === undefined ? {} : { style: lineNumberStyle }),
      source: input.source({
        cellRole: 'decoration',
        partName: 'lineNumber',
        partType: 'lineNumber',
        description: active ? 'activeLine.lineNumber' : 'lineNumber',
      }),
    }),
    span(` ${input.theme.tokens.symbols.borderSingle.vertical} `, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.source({
        cellRole: 'decoration',
        partName: active ? 'activeLine' : 'gutter',
        partType: 'gutter',
        description: active ? 'activeLine.gutter' : 'gutter.separator',
      }),
    }),
  ];
}

interface VisibleTextWindow {
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

function visibleTextWindow(
  line: TextAreaLayoutLine,
  offsetColumn: number,
  width: number,
): VisibleTextWindow {
  const startGrapheme = line.index.visualColumnToGraphemeIndex(Math.max(0, offsetColumn));
  const endGrapheme = line.index.visualColumnToGraphemeIndex(Math.max(0, offsetColumn + width));
  const startOffset = line.index.graphemeIndexToCodeUnitOffset(startGrapheme);
  const endOffset = line.index.graphemeIndexToCodeUnitOffset(endGrapheme);
  return { text: line.text.slice(startOffset, endOffset), startOffset, endOffset };
}

function textAreaValueSpans(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  geometry: TextAreaGeometry,
  line: TextAreaLayoutLine,
  window: VisibleTextWindow,
  selection: TextSelection | undefined,
  active: boolean,
): readonly RenderSpan[] {
  if (window.text === '') return [];
  const absoluteStart = line.start + window.startOffset;
  const absoluteEnd = line.start + window.endOffset;
  const cuts = new Set<number>([absoluteStart, absoluteEnd]);
  if (selection !== undefined) {
    cuts.add(Math.max(absoluteStart, Math.min(absoluteEnd, selection.startOffset)));
    cuts.add(Math.max(absoluteStart, Math.min(absoluteEnd, selection.endOffsetExclusive)));
  }
  for (const highlight of input.model.highlights) {
    if (highlight.endOffsetExclusive <= absoluteStart || highlight.startOffset >= absoluteEnd) {
      continue;
    }
    cuts.add(Math.max(absoluteStart, highlight.startOffset));
    cuts.add(Math.min(absoluteEnd, highlight.endOffsetExclusive));
  }
  const boundaries = [...cuts].toSorted((left, right) => left - right);
  return boundaries.flatMap((start, index) => {
    const end = boundaries[index + 1];
    if (end === undefined || end <= start) return [];
    const text = window.text.slice(start - absoluteStart, end - absoluteStart);
    const selected = selection !== undefined &&
      start >= selection.startOffset &&
      end <= selection.endOffsetExclusive;
    const highlight = selected
      ? undefined
      : input.model.highlights.find((candidate) =>
        start >= candidate.startOffset && end <= candidate.endOffsetExclusive
      );
    const placeholder = geometry.usesPlaceholder;
    const part: TextAreaStylePart = selected
      ? 'selection'
      : highlight === undefined
      ? placeholder ? 'placeholder' : active ? 'activeLine' : 'value'
      : 'highlight';
    const base: TerminalStyle = selected
      ? {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
      }
      : highlight === undefined
      ? {
        fg: { kind: 'theme', token: placeholder ? 'input.placeholder' : 'text.default' },
        bg: {
          kind: 'theme',
          token: active ? 'editor.activeLine.background' : 'control.background',
        },
      }
      : {
        fg: { kind: 'theme', token: 'menu.match' },
        underline: true,
        ...highlight.style,
      };
    const style = input.style({
      part,
      base,
      ...(selected
        ? { state: 'selected' as const }
        : input.disabled
        ? { state: 'disabled' as const }
        : {}),
    });
    const description = selected ? 'selection' : highlight?.label ??
      (placeholder ? 'placeholder' : active ? 'activeLine.value' : 'value');
    return [span(text, {
      ...(style === undefined ? {} : { style }),
      source: input.source({
        cellRole: 'text',
        partName: part,
        partType: selected ? 'selection' : highlight === undefined ? part : 'highlight',
        description,
      }),
    })];
  });
}

interface TextAreaLayoutLine {
  readonly text: string;
  readonly start: number;
  readonly logicalLineIndex: number;
  readonly firstVisualLine: boolean;
  readonly index: TerminalTextIndex;
}

interface TextAreaDocumentLayout {
  readonly lines: readonly TextAreaLayoutLine[];
  readonly logicalLineRowStarts: readonly number[];
  readonly contentRows: number;
  readonly intrinsicColumns: number;
  readonly contentColumns: number;
}

interface TextAreaLogicalLineLayout {
  readonly text: string;
  readonly intrinsicColumns: number;
  readonly visualLines: readonly {
    readonly text: string;
    readonly localStart: number;
    readonly firstVisualLine: boolean;
    readonly index: TerminalTextIndex;
  }[];
}

const textAreaLayouts = new WeakMap<TextDocument, Map<string, TextAreaDocumentLayout>>();
const textAreaLogicalLayouts = new WeakMap<TextDocument, Map<string, readonly TextAreaLogicalLineLayout[]>>();

function layoutTextAreaDocument(
  document: TextDocument,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
): TextAreaDocumentLayout {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const key = `${wrap ? 'wrap' : 'single'}:${String(normalizedWidth)}:${
    textWidthProfileKey(widthProfile)
  }`;
  let cache = textAreaLayouts.get(document);
  if (cache === undefined) {
    cache = new Map();
    textAreaLayouts.set(document, cache);
  }
  const cached = cache.get(key);
  if (cached !== undefined) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const lines: TextAreaLayoutLine[] = [];
  const logicalLineRowStarts: number[] = [];
  let intrinsicColumns = 0;
  const logicalLines = logicalLineLayouts(document, normalizedWidth, wrap, widthProfile, key);
  for (let lineIndex = 0; lineIndex < logicalLines.length; lineIndex += 1) {
    logicalLineRowStarts.push(lines.length);
    const line = textDocumentLineAt(document, lineIndex);
    const logical = logicalLines[lineIndex];
    if (line === undefined || logical === undefined) continue;
    intrinsicColumns = Math.max(intrinsicColumns, logical.intrinsicColumns);
    for (const visual of logical.visualLines) {
      lines.push({
        text: visual.text,
        start: line.startOffset + visual.localStart,
        logicalLineIndex: lineIndex,
        firstVisualLine: visual.firstVisualLine,
        index: visual.index,
      });
    }
  }
  const created = Object.freeze({
    lines: Object.freeze(lines),
    logicalLineRowStarts: Object.freeze(logicalLineRowStarts),
    contentRows: lines.length,
    intrinsicColumns,
    contentColumns: wrap ? Math.min(intrinsicColumns, normalizedWidth) : intrinsicColumns,
  });
  while (cache.size >= 8) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, created);
  return created;
}

function logicalLineLayouts(
  document: TextDocument,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
  key: string,
): readonly TextAreaLogicalLineLayout[] {
  const cached = textAreaLogicalLayouts.get(document)?.get(key);
  if (cached !== undefined) return cached;
  const count = textDocumentLineCount(document);
  const result: (TextAreaLogicalLineLayout | undefined)[] = Array.from({ length: count });
  const lineage = textDocumentParentChange(document);
  const parent = lineage === undefined ? undefined : textAreaLogicalLayouts.get(lineage.parent)?.get(key);
  let prefixEnd = 0;
  let suffixStart = count;
  let parentSuffixStart = parent?.length ?? 0;
  if (lineage !== undefined && parent !== undefined) {
    prefixEnd = textDocumentLineIndexAtOffset(lineage.parent, lineage.replaced.startOffset);
    parentSuffixStart = textDocumentLineIndexAtOffset(
      lineage.parent,
      lineage.replaced.endOffsetExclusive,
    ) + 1;
    suffixStart = textDocumentLineIndexAtOffset(
      document,
      lineage.replaced.startOffset + lineage.insertedLength,
    ) + 1;
  }
  for (let lineIndex = 0; lineIndex < count; lineIndex += 1) {
    const inherited = lineIndex < prefixEnd
      ? parent?.[lineIndex]
      : lineIndex >= suffixStart
        ? parent?.[parentSuffixStart + lineIndex - suffixStart]
        : undefined;
    if (inherited !== undefined) {
      result[lineIndex] = inherited;
      continue;
    }
    const line = textDocumentLineAt(document, lineIndex);
    if (line !== undefined) result[lineIndex] = prepareLogicalLineLayout(line.text, width, wrap, widthProfile);
  }
  const owned = Object.freeze(result.filter((line): line is TextAreaLogicalLineLayout => line !== undefined));
  const byKey = textAreaLogicalLayouts.get(document) ?? new Map<string, readonly TextAreaLogicalLineLayout[]>();
  byKey.set(key, owned);
  while (byKey.size > 8) {
    const oldest = byKey.keys().next().value;
    if (oldest === undefined) break;
    byKey.delete(oldest);
  }
  textAreaLogicalLayouts.set(document, byKey);
  return owned;
}

function prepareLogicalLineLayout(
  text: string,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
): TextAreaLogicalLineLayout {
  const index = createTerminalTextIndex(text, { widthProfile });
  if (!wrap || width <= 0 || index.cells <= width || text === '') {
    return Object.freeze({
      text,
      intrinsicColumns: index.cells,
      visualLines: Object.freeze([{ text, localStart: 0, firstVisualLine: true, index }]),
    });
  }
  const visualLines: TextAreaLogicalLineLayout['visualLines'][number][] = [];
  let visualColumn = 0;
  while (visualColumn < index.cells) {
    const startGrapheme = index.visualColumnToGraphemeIndex(visualColumn);
    const endGrapheme = Math.max(
      startGrapheme + 1,
      index.visualColumnToGraphemeIndex(visualColumn + width),
    );
    const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
    const endOffset = index.graphemeIndexToCodeUnitOffset(endGrapheme);
    const visualText = text.slice(startOffset, endOffset);
    visualLines.push(Object.freeze({
      text: visualText,
      localStart: startOffset,
      firstVisualLine: startOffset === 0,
      index: createTerminalTextIndex(visualText, { widthProfile }),
    }));
    visualColumn = index.graphemeIndexToVisualColumn(endGrapheme);
    if (endOffset >= text.length) break;
  }
  return Object.freeze({ text, intrinsicColumns: index.cells, visualLines: Object.freeze(visualLines) });
}

function textAreaCursorInLayout(
  layout: TextAreaDocumentLayout,
  caret: TextCaret,
): { readonly rowIndex: number; readonly columnCells: number } {
  const offset = caret.position.offset;
  let low = 0;
  let high = layout.lines.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((layout.lines[middle]?.start ?? Number.POSITIVE_INFINITY) <= offset) low = middle + 1;
    else high = middle;
  }
  let rowIndex = Math.max(0, Math.min(layout.lines.length - 1, low - 1));
  const next = layout.lines[rowIndex + 1];
  if (next?.start === offset && caret.position.affinity !== 'upstream') rowIndex += 1;
  const line = layout.lines[rowIndex];
  if (line === undefined) return { rowIndex: 0, columnCells: 0 };
  const localOffset = Math.max(0, Math.min(line.text.length, offset - line.start));
  const grapheme = line.index.codeUnitOffsetToGraphemeIndex(localOffset);
  return { rowIndex, columnCells: line.index.graphemeIndexToVisualColumn(grapheme) };
}

function edit(
  kind:
    | 'deleteBackward'
    | 'deleteForward'
    | 'moveLeft'
    | 'moveRight'
    | 'moveLineUp'
    | 'moveLineDown'
    | 'movePageUp'
    | 'movePageDown'
    | 'moveHome'
    | 'moveEnd',
): TextAreaAction {
  switch (kind) {
    case 'deleteBackward':
      return { kind: 'edit', operation: { kind } };
    case 'deleteForward':
      return { kind: 'edit', operation: { kind } };
    case 'moveLeft':
      return { kind: 'edit', operation: { kind } };
    case 'moveRight':
      return { kind: 'edit', operation: { kind } };
    case 'moveLineUp':
      return { kind: 'edit', operation: { kind } };
    case 'moveLineDown':
      return { kind: 'edit', operation: { kind } };
    case 'movePageUp':
      return { kind: 'edit', operation: { kind } };
    case 'movePageDown':
      return { kind: 'edit', operation: { kind } };
    case 'moveHome':
      return { kind: 'edit', operation: { kind } };
    case 'moveEnd':
      return { kind: 'edit', operation: { kind } };
  }
}

function textAreaHistoryTriggers() {
  return [
    {
      trigger: { kind: 'key' as const, key: 'z' as const, modifiers: { ctrl: true } },
      onKey: () => ({ kind: 'undo' as const })
    },
    {
      trigger: { kind: 'key' as const, key: 'y' as const, modifiers: { ctrl: true } },
      onKey: () => ({ kind: 'redo' as const })
    },
    {
      trigger: {
        kind: 'key' as const,
        key: 'z' as const,
        modifiers: { ctrl: true, shift: true }
      },
      onKey: () => ({ kind: 'redo' as const })
    }
  ];
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
