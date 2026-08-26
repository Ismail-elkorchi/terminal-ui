import {
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  layoutComponentScrollbar,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
  decodeTerminalStyle,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { Measurement, Rect } from '../../renderer/index.ts';
import {
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { scrollReducer } from '../../behavior/scroll.ts';
import {
  assertTextDocument,
  createRowOffsetMap,
  createTerminalTextIndex,
  defaultTextWidthProfile,
  measureTextCells,
  normalizeTextCaret,
  normalizeTextDocumentOffset,
  normalizeTextDocumentSelection,
  createTextDocument,
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
  RowOffsetMap,
  TerminalTextIndex,
  TextCaret,
  TextDocument,
  TextDocumentSelection,
  TextSelection,
  TextWidthProfile,
} from '../../text/index.ts';
import {
  defaultTheme,
  terminalStyleHasBackground,
  type TerminalTheme
} from '../../theme/index.ts';
import type { TextAreaTransition } from '../../behavior/text-area.ts';
import type {
  TextAreaDecoration,
  TextAreaLineNumberOptions,
  TextAreaWrapOptions,
} from '../text-area.ts';
import type { TextAreaStylePart } from '../style-parts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { ScrollableTextAreaOptions, TextAreaOptions } from '../options/content-and-collections.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';
import { textPointerTarget } from '../internal/text-pointer-target.ts';
import {
  inspectTextDocumentValue,
  inspectTextSelection,
  inspectValidation,
} from '../internal/inspection.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import {
  createTextAreaProjection,
  type TextAreaDecorationModel,
  type ProjectedTextStyleRange,
  type TextAreaProjection
} from '../internal/text-area-projection.ts';

export interface TextAreaRowOffsetMapOptions {
  readonly document: TextDocument;
  readonly terminalWidth: number;
  readonly terminalRows: number;
  readonly decorations?: readonly TextAreaDecoration[];
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly scrollbar?: ScrollbarOptions;
  readonly widthProfile?: TextWidthProfile;
  readonly theme?: TerminalTheme;
}

interface TextAreaModel {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly placeholder: string;
  readonly selection?: TextDocumentSelection;
  readonly decorations: readonly TextAreaDecorationModel[];
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

const textAreaDecorationBoundaryIndexes = new WeakMap<TextDocument, TerminalTextIndex>();

type TextAreaComponentAction = TextAreaTransition | {
  readonly kind: 'contextMenu';
  readonly event: TextContextMenuEvent;
};

type TextAreaFactory = <const TMessage extends ComponentMessage = never>(
  options: TextAreaOptions<TMessage>,
) => Element<TMessage>;

const instantiateTextArea = defineComponent<
  Omit<TextAreaOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'>,
  TextAreaModel,
  TextAreaComponentAction,
  TextAreaStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'active', 'selected', 'disabled', 'readOnly']
>({
  name: 'terminal-ui/components/text-area',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'textbox',
  states: ['disabled', 'readOnly'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'value',
    'placeholder',
    'selection',
    'cursor',
    'error',
    'gutter',
    'lineNumber',
    'activeLine',
    'decoration',
    'scrollbarTrack', 'scrollbarThumb',
  ],
  visualStates: ['focused', 'hovered', 'active', 'selected', 'disabled', 'readOnly'],
  createModel: createTextAreaModel,
  inspection: ({ model }) => {
    const selection = model.selection === undefined
      ? undefined
      : textDocumentSelectionRange(model.document, model.selection, model.caret);
    return {
      value: inspectTextDocumentValue(model.document),
      ...(selection === undefined ? {} : { selection: inspectTextSelection(selection) }),
      details: { caretOffset: model.caret.position.offset },
      validation: inspectValidation(model.required, model.error),
    };
  },
  measure: measureTextArea,
  render: paintTextArea,
  keys: ({ readOnly }) => ({
    triggers: [
      ...textEditingTriggers(readOnly, true),
      ...(readOnly ? [] : textAreaHistoryTriggers())
    ],
    ...(readOnly ? {} : {
      enter: () => ({ kind: 'edit' as const, operation: { kind: 'insert' as const, text: '\n' } }),
    }),
  }),
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  focusTargets(input) {
    const geometry = textAreaGeometry(input);
    const caret = textAreaCursorInLayout(
      geometry.layout,
      projectedCaret(geometry.projection, input.model.caret)
    );
    const row = caret.rowIndex - geometry.scrollbar.scroll.offsetRow;
    const column = geometry.prefixWidth +
      caret.columnCells -
      geometry.scrollbar.scroll.offsetColumn;
    const cursorStyle = input.style({
      part: 'cursor',
      states: ['focused'],
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
          source: input.frameSource({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
        },
      }),
    }];
  },
  hitTargets(input) {
    const geometry = textAreaGeometry(input);
    const selectionRange = input.model.selection === undefined
      ? undefined
      : textDocumentSelectionRange(input.model.document, input.model.selection, input.model.caret);
    return [
      textPointerTarget<TextAreaComponentAction>({
        id: `${input.id ?? 'text-area'}:text`,
        bounds: geometry.scrollbar.contentBounds,
        ...(selectionRange === undefined ? {} : { selection: selectionRange }),
        focusTargetId: 'self',
        offsetAt(event, origin) {
          return pointerOffset(
            input,
            origin === 'press'
              ? event.pressLocalRow ?? event.localRow ?? event.row
              : event.localRow ?? event.row,
            origin === 'press'
              ? event.pressLocalColumn ?? event.localColumn ?? event.column
              : event.localColumn ?? event.column,
          );
        },
        wordSelectionAt: (offset) => textAreaWordSelectionAt(input.model.document, offset, input.widthProfile),
        onPointer: (transition, event) => {
          const scrollRequest = textAreaDragScrollRequest(input, geometry, transition, event);
          return {
            kind: 'pointer',
            transition,
            ...(scrollRequest === undefined ? {} : { scrollRequest }),
          };
        },
        onContextMenu: (event) => ({ kind: 'contextMenu', event }),
      }),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<TextAreaComponentAction>({
        id: input.id ?? 'text-area',
        plan: geometry.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => ({ kind: 'scroll', request }),
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
    const selection = model.selection === undefined
      ? undefined
      : textDocumentSelectionRange(model.document, model.selection, model.caret);
    const accessibilityCaret = geometry.usesPlaceholder
      ? 0
      : geometry.projection.accessibilityOffsetAtSourceOffset(
          model.caret.position.offset,
          model.caret.position.affinity
        );
    const accessibilitySelection = geometry.usesPlaceholder || selection === undefined
      ? undefined
      : {
          startOffset: geometry.projection.accessibilityOffsetAtSourceOffset(
            selection.startOffset,
            'downstream'
          ),
          endOffsetExclusive: geometry.projection.accessibilityOffsetAtSourceOffset(
            selection.endOffsetExclusive,
            'upstream'
          )
        };
    return {
      id,
      role: 'textbox',
      value: geometry.usesPlaceholder ? value : geometry.projection.accessibilityText,
      textPosition: {
        caretOffset: accessibilityCaret,
        ...(accessibilitySelection === undefined ? {} : { selection: accessibilitySelection }),
      },
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
  assertRequiredCallback(options.onTransition, 'textArea onTransition');
  if (!isScrollableTextArea(options)) {
    const { onTransition, onContextMenu, ...componentOptions } = options;
    return instantiateTextArea({
      ...componentOptions,
      onAction: (action) => action.kind === 'contextMenu'
        ? onContextMenu?.(action.event) ?? ignoreMessage()
        : action.kind === 'scroll' ? ignoreMessage() : onTransition(action),
    });
  }
  const { onTransition, onContextMenu, ...componentOptions } = options;
  return instantiateTextArea({
    ...componentOptions,
    onAction: (action) => action.kind === 'contextMenu'
      ? onContextMenu?.(action.event) ?? ignoreMessage()
      : onTransition(action),
  });
};

function isScrollableTextArea<TMessage extends ComponentMessage>(
  options: Exclude<TextAreaOptions<TMessage>, { readonly disabled: true }>,
): options is ScrollableTextAreaOptions<TMessage> {
  return hasScrollState(options.state);
}

function hasScrollState(value: unknown): boolean {
  return isNonArrayObject(value) && Reflect.get(value, 'scroll') !== undefined;
}

function createTextAreaModel(
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
  const decorations = createTextAreaModelDecorations(value.decorations, document);
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

export function createTextAreaRowOffsetMap(
  options: TextAreaRowOffsetMapOptions
): RowOffsetMap {
  if (!isNonArrayObject(options)) {
    throw new TypeError('Text area row-offset map options must be an object.');
  }
  assertTextDocument(options.document);
  const terminalWidth = layoutDimension(options.terminalWidth, 'terminalWidth');
  const terminalRows = layoutDimension(options.terminalRows, 'terminalRows');
  const widthProfile = options.widthProfile ?? defaultTextWidthProfile;
  const theme = options.theme ?? defaultTheme;
  const lineNumbers = decodeLineNumbers(options.lineNumbers);
  const wrap = decodeWrap(options.wrap);
  const decorations = createTextAreaModelDecorations(options.decorations, options.document);
  const projection = createTextAreaProjection(options.document, decorations, widthProfile);
  const lineCount = textDocumentLineCount(projection.document);
  const prefixWidth = textAreaPrefixWidth(
    lineNumbers === undefined ? {} : { lineNumbers },
    theme,
    widthProfile,
    lineCount
  );
  let contentWidth = Math.max(0, terminalWidth - prefixWidth);
  let layout = layoutTextAreaDocument(projection.document, contentWidth, wrap, widthProfile);
  const scrollbarOptions = decodeComponentScrollbarOptions(
    options.scrollbar,
    'textArea row-offset map scrollbar'
  );
  const plan = layoutComponentScrollbar({
    bounds: {
      row: 0,
      column: prefixWidth,
      width: contentWidth,
      height: terminalRows
    },
    scroll: { offsetRow: 0, offsetColumn: 0, followTail: false },
    contentRows: layout.contentRows,
    contentColumns: layout.contentColumns,
    ...(scrollbarOptions === undefined ? {} : { options: scrollbarOptions }),
    defaultAxis: 'both'
  });
  if (plan.contentBounds.width !== contentWidth) {
    contentWidth = plan.contentBounds.width;
    layout = layoutTextAreaDocument(projection.document, contentWidth, wrap, widthProfile);
  }
  return createRowOffsetMap(layout.lines.map((line) => (
    projection.sourceOffsetAtDisplayOffset(line.start, 'upstream')
  )));
}

function layoutDimension(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Text area row-offset map ${field} must be a non-negative finite number.`);
  }
  return Math.floor(value);
}

function measureTextArea(input: ComponentMeasureInput<TextAreaModel>): Measurement {
  const document = textAreaDisplayDocument(input.model, input.widthProfile).document;
  const count = textDocumentLineCount(document);
  const prefix = textAreaPrefixWidth(input.model, input.theme, input.widthProfile, count);
  const width = Math.max(0, input.constraints.width - prefix);
  const layout = layoutTextAreaDocument(document, width, input.model.wrap, input.widthProfile);
  return {
    minWidth: prefix,
    minHeight: 1,
    preferredWidth: layout.intrinsicColumns + prefix,
    preferredHeight: layout.contentRows + Number(input.model.error !== ''),
  };
}

interface TextAreaGeometry {
  readonly document: TextDocument;
  readonly projection: TextAreaProjection;
  readonly usesPlaceholder: boolean;
  readonly lineCount: number;
  readonly prefixWidth: number;
  readonly layout: TextAreaDocumentLayout;
  readonly scrollbar: ReturnType<typeof layoutComponentScrollbar>;
}

function textAreaGeometry(input: ComponentInput<TextAreaModel>): TextAreaGeometry {
  const display = textAreaDisplayDocument(input.model, input.widthProfile);
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
    projection: display.projection,
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
  const availabilityStates = textAreaAvailabilityStates(input);
  paintTextAreaPlane(input, input.bounds, input.style({
    part: 'root',
    ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
  }), 'root.background', 'root');
  const gutterStyle = input.style({
    part: 'gutter',
    base: {
      fg: { kind: 'theme', token: 'editor.gutter.foreground' },
      bg: { kind: 'theme', token: 'editor.gutter.background' },
    },
    ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
  });
  paintTextAreaPlane(input, {
    row: input.bounds.row,
    column: input.bounds.column,
    width: geometry.prefixWidth,
    height: textAreaEditorHeight(input.model, input.bounds.height),
  }, gutterStyle, 'gutter.background', 'gutter');
  const active = textDocumentLineIndexAtOffset(
    input.model.document,
    input.model.caret.position.offset,
  );
  const sourceSelection = geometry.usesPlaceholder || input.model.selection === undefined
    ? undefined
    : textDocumentSelectionRange(input.model.document, input.model.selection, input.model.caret);
  const selection = sourceSelection === undefined
    ? undefined
    : {
        startOffset: geometry.projection.displayOffsetAtSourceOffset(
          sourceSelection.startOffset,
          'downstream'
        ),
        endOffsetExclusive: geometry.projection.displayOffsetAtSourceOffset(
          sourceSelection.endOffsetExclusive,
          'upstream'
        )
      };
  for (let visibleRow = 0; visibleRow < content.height; visibleRow += 1) {
    const rowIndex = geometry.scrollbar.scroll.offsetRow + visibleRow;
    const line = geometry.layout.lines[rowIndex];
    if (line === undefined) break;
    const isActive = input.model.highlightActiveLine && line.logicalLineIndex === active;
    const prefix = textAreaPrefixSpans(input, geometry, line, visibleRow, isActive);
    const window = visibleTextWindow(
      line,
      geometry.scrollbar.scroll.offsetColumn,
      content.width,
    );
    const valueSpans = textAreaValueSpans(input, geometry, line, window, selection, isActive);
    if (isActive) {
      paintTextAreaPlane(input, {
        row: content.row + visibleRow,
        column: content.column,
        width: content.width,
        height: 1,
      }, input.style({
        part: 'activeLine',
        base: { bg: { kind: 'theme', token: 'editor.activeLine.background' } },
        ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
      }), 'activeLine.background', 'activeLine');
    }
    input.target.write(content.row + visibleRow, input.bounds.column, prefix);
    input.target.write(content.row + visibleRow, content.column, valueSpans);
  }
  paintComponentScrollbar({
    target: input.target,
    plan: geometry.scrollbar,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
  paintTextAreaError(input);
}

function paintTextAreaPlane(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  bounds: Rect,
  style: TerminalStyle | undefined,
  description: string,
  partName: 'root' | 'gutter' | 'activeLine',
): void {
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !terminalStyleHasBackground(style, input.theme)
  ) return;
  for (let row = 0; row < bounds.height; row += 1) {
    input.target.write(bounds.row + row, bounds.column, [span(' '.repeat(bounds.width), {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName,
        partType: 'background',
        description,
      }),
    })]);
  }
}

function paintTextAreaError(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
): void {
  const row = textAreaEditorHeight(input.model, input.bounds.height);
  if (input.model.error === '' || row >= input.bounds.height) return;
  const style = input.style({
    part: 'error',
    base: { fg: { kind: 'theme', token: 'status.error' }, bold: true },
  });
  input.target.write(row, input.bounds.column, [span(input.model.error, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'text',
      partName: 'error',
      partType: 'error',
      description: 'validation.error',
    }),
  })]);
}

function textAreaAvailabilityStates(
  input: Pick<ComponentInput<TextAreaModel>, 'disabled' | 'readOnly'>,
): readonly ('disabled' | 'readOnly')[] {
  if (input.disabled) return ['disabled'];
  if (input.readOnly) return ['readOnly'];
  return [];
}

function textAreaEditorHeight(model: TextAreaModel, height: number): number {
  return Math.max(0, height - Number(model.error !== '' && height > 1));
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
  return normalizeTextDocumentOffset(input.model.document, geometry.projection.sourceOffsetAtDisplayOffset(
    line.start + line.index.graphemeIndexToCodeUnitOffset(grapheme),
    'downstream'
  ));
}

function textAreaDragScrollRequest(
  input: ComponentInput<TextAreaModel>,
  geometry: TextAreaGeometry,
  transition: import('../../interaction/text-pointer.ts').TextPointerTransition,
  event: import('../../input/pointer.ts').RoutedPointerEvent,
): import('../../interaction/scroll.ts').ScrollRequest | undefined {
  if (input.model.scroll === undefined || transition.kind !== 'extendSelection') return undefined;
  const localRow = event.localRow ?? event.row - geometry.scrollbar.contentBounds.row + 1;
  const rows = localRow < 1
    ? -1
    : localRow > geometry.scrollbar.contentBounds.height
    ? 1
    : 0;
  if (rows === 0) return undefined;
  const nextState = scrollReducer(
    geometry.scrollbar.scroll,
    { kind: 'scrollLines', rows },
    geometry.scrollbar.geometry,
  );
  return nextState === geometry.scrollbar.scroll
    ? undefined
    : { nextState, source: 'drag', target: 'content' };
}

function textAreaWordSelectionAt(
  document: TextDocument,
  offset: number,
  widthProfile: TextWidthProfile,
): TextSelection {
  const normalized = normalizeTextDocumentOffset(document, offset);
  const lineIndex = textDocumentLineIndexAtOffset(document, normalized);
  const line = textDocumentLineAt(document, lineIndex);
  if (line === undefined) return { startOffset: normalized, endOffsetExclusive: normalized };
  const local = createTerminalTextIndex(line.text, { widthProfile }).wordSelectionAt(
    normalized - line.startOffset,
  );
  return {
    startOffset: line.startOffset + local.startOffset,
    endOffsetExclusive: line.startOffset + local.endOffsetExclusive,
  };
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

function createTextAreaModelDecorations(
  value: readonly TextAreaDecoration[] | undefined,
  document: TextDocument,
): readonly TextAreaDecorationModel[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError('textArea decorations must be an array.');
  if (value.length === 0) return Object.freeze([]);
  const boundaryIndex = textAreaDecorationBoundaryIndex(document);
  const decorationModels = value.map((candidate, index): TextAreaDecorationModel => {
    if (!isNonArrayObject(candidate)) {
      throw new TypeError(`textArea decorations[${String(index)}] is invalid.`);
    }
    const startOffset = candidate['startOffset'];
    const endOffsetExclusive = candidate['endOffsetExclusive'];
    const kind = candidate['kind'];
    if (!isStringMember(kind, ['style', 'replace', 'conceal'])) {
      throw new TypeError(`textArea decorations[${String(index)}].kind is invalid.`);
    }
    const replacementText = candidate['replacementText'];
    const accessibilityText = candidate['accessibilityText'];
    if (
      typeof startOffset !== 'number' ||
      typeof endOffsetExclusive !== 'number' ||
      !Number.isSafeInteger(startOffset) ||
      !Number.isSafeInteger(endOffsetExclusive) ||
      startOffset < 0 ||
      endOffsetExclusive < startOffset ||
      (endOffsetExclusive === startOffset && kind !== 'replace') ||
      endOffsetExclusive > textDocumentLength(document)
    ) {
      throw new RangeError(`textArea decorations[${String(index)}] range is invalid.`);
    }
    if (accessibilityText !== undefined && typeof accessibilityText !== 'string') {
      throw new TypeError(`textArea decorations[${String(index)}].accessibilityText must be a string.`);
    }
    if (
      !terminalTextIndexHasBoundary(boundaryIndex, startOffset)
      || !terminalTextIndexHasBoundary(boundaryIndex, endOffsetExclusive)
    ) {
      throw new RangeError(
        `textArea decorations[${String(index)}] must align with text grapheme boundaries.`
      );
    }
    const label = textOption(candidate['label'], `textArea decorations[${String(index)}].label`) ??
      `decoration.${String(index)}`;
    const style = candidate['style'] === undefined
      ? undefined
      : decodeTerminalStyle(candidate['style'], `textArea decorations[${String(index)}].style`);
    const base = { startOffset, endOffsetExclusive, order: index, label };
    switch (kind) {
      case 'style':
        if (replacementText !== undefined || accessibilityText !== undefined) {
          throw new TypeError(`textArea style decoration ${String(index)} cannot replace or relabel content.`);
        }
        return Object.freeze({ ...base, kind, ...(style === undefined ? {} : { style }) });
      case 'replace':
        if (typeof replacementText !== 'string') {
          throw new TypeError(`textArea replacement decoration ${String(index)} requires replacementText.`);
        }
        if (replacementText.length === 0) {
          throw new TypeError(`textArea replacement decoration ${String(index)} requires non-empty replacementText.`);
        }
        return Object.freeze({
          ...base,
          kind,
          replacementText,
          ...(style === undefined ? {} : { style }),
          ...(accessibilityText === undefined ? {} : { accessibilityText }),
        });
      case 'conceal':
        if (replacementText !== undefined || accessibilityText !== undefined || style !== undefined) {
          throw new TypeError(`textArea conceal decoration ${String(index)} cannot replace, style, or relabel content.`);
        }
        return Object.freeze({ ...base, kind });
    }
  });
  const replacements = decorationModels
    .filter((decoration) => decoration.kind === 'replace')
    .toSorted((left, right) => left.startOffset - right.startOffset || left.endOffsetExclusive - right.endOffsetExclusive);
  let previousEnd = 0;
  for (let index = 0; index < replacements.length; index += 1) {
    const replacement = replacements[index];
    if (replacement === undefined) continue;
    if (index > 0 && replacement.startOffset < previousEnd) {
      throw new RangeError('textArea replacement decorations must not overlap.');
    }
    previousEnd = Math.max(previousEnd, replacement.endOffsetExclusive);
  }
  for (const decoration of decorationModels) {
    if (decoration.kind !== 'style') continue;
    if (
      replacementContainingInteriorOffset(replacements, decoration.startOffset) !== undefined
      || replacementContainingInteriorOffset(replacements, decoration.endOffsetExclusive) !== undefined
    ) {
      throw new RangeError('textArea style decorations must not partially overlap replacement decorations.');
    }
  }
  const conceals = mergeTextAreaConcealments(decorationModels.filter((decoration) => decoration.kind === 'conceal'));
  for (const conceal of conceals) {
    if (replacements.some((replacement) => rangesOverlap(conceal, replacement))) {
      throw new RangeError('textArea conceal and replacement decorations must not overlap.');
    }
  }
  return Object.freeze([
    ...decorationModels.filter((decoration) => decoration.kind !== 'conceal'),
    ...conceals,
  ]);
}

function mergeTextAreaConcealments(
  decorations: readonly TextAreaDecorationModel[],
): readonly TextAreaDecorationModel[] {
  const ordered = decorations.toSorted((left, right) => (
    left.startOffset - right.startOffset || left.endOffsetExclusive - right.endOffsetExclusive
  ));
  const merged: TextAreaDecorationModel[] = [];
  for (const decoration of ordered) {
    const previous = merged.at(-1);
    if (previous === undefined || decoration.startOffset > previous.endOffsetExclusive) {
      merged.push(decoration);
      continue;
    }
    merged[merged.length - 1] = Object.freeze({
      kind: 'conceal',
      startOffset: previous.startOffset,
      endOffsetExclusive: Math.max(previous.endOffsetExclusive, decoration.endOffsetExclusive),
      order: Math.min(previous.order, decoration.order),
      label: previous.label,
    });
  }
  return Object.freeze(merged);
}

function rangesOverlap(
  left: Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'>,
  right: Pick<TextAreaDecorationModel, 'startOffset' | 'endOffsetExclusive'>,
): boolean {
  return left.startOffset < right.endOffsetExclusive
    && right.startOffset < left.endOffsetExclusive;
}

function replacementContainingInteriorOffset(
  replacements: readonly TextAreaDecorationModel[],
  offset: number,
): TextAreaDecorationModel | undefined {
  let low = 0;
  let high = replacements.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((replacements[middle]?.startOffset ?? Number.POSITIVE_INFINITY) < offset) low = middle + 1;
    else high = middle;
  }
  const candidate = replacements[low - 1];
  return candidate !== undefined
    && candidate.startOffset < offset
    && offset < candidate.endOffsetExclusive
    ? candidate
    : undefined;
}

function terminalTextIndexHasBoundary(index: TerminalTextIndex, offset: number): boolean {
  return index.graphemeIndexToCodeUnitOffset(index.codeUnitOffsetToGraphemeIndex(offset)) === offset;
}

function textAreaDecorationBoundaryIndex(document: TextDocument): TerminalTextIndex {
  const existing = textAreaDecorationBoundaryIndexes.get(document);
  if (existing !== undefined) return existing;
  const created = createTerminalTextIndex(textDocumentText(document));
  textAreaDecorationBoundaryIndexes.set(document, created);
  return created;
}

function decodeLineNumbers(
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

function decodeWrap(value: boolean | TextAreaWrapOptions | undefined): boolean {
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

function textAreaDisplayDocument(model: TextAreaModel, widthProfile: TextWidthProfile): {
  readonly document: TextDocument;
  readonly projection: TextAreaProjection;
  readonly usesPlaceholder: boolean;
} {
  const usesPlaceholder = textDocumentLength(model.document) === 0 && model.placeholder !== '';
  const source = usesPlaceholder ? createTextDocument(model.placeholder) : model.document;
  const projection = createTextAreaProjection(
    source,
    usesPlaceholder ? [] : model.decorations,
    widthProfile
  );
  return {
    document: projection.document,
    projection,
    usesPlaceholder,
  };
}

function projectedCaret(projection: TextAreaProjection, caret: TextCaret): TextCaret {
  return {
    ...caret,
    position: {
      ...caret.position,
      offset: projection.displayOffsetAtSourceOffset(
        caret.position.offset,
        caret.position.affinity === 'upstream' ? 'upstream' : 'downstream'
      )
    }
  };
}

function textAreaScrollbar(
  input: ComponentInput<TextAreaModel>,
  layout: TextAreaDocumentLayout,
  prefixWidth: number,
) {
  const raw = input.model.scroll;
  return layoutComponentScrollbar({
    bounds: {
      row: input.bounds.row,
      column: input.bounds.column + prefixWidth,
      width: Math.max(0, input.bounds.width - prefixWidth),
      height: textAreaEditorHeight(input.model, input.bounds.height),
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
  model: Pick<TextAreaModel, 'lineNumbers'>,
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
  const availabilityStates = textAreaAvailabilityStates(input);
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
      : input.theme.tokens.symbols.borderSingle.vertical
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
    ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
  });
  if (input.model.lineNumbers === undefined) {
    return [span(`${marker} `, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
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
    ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
  });
  return [
    span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: active ? 'activeLine' : 'gutter',
        partType: 'marker',
        description: active ? 'activeLine.marker' : 'gutter.marker',
      }),
    }),
    span(lineNumber, {
      ...(lineNumberStyle === undefined ? {} : { style: lineNumberStyle }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: 'lineNumber',
        partType: 'lineNumber',
        description: active ? 'activeLine.lineNumber' : 'lineNumber',
      }),
    }),
    span(` ${input.theme.tokens.symbols.borderSingle.vertical} `, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
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
  const decorations = projectedStyleRangesBetween(
    geometry.projection.styleRanges,
    absoluteStart,
    absoluteEnd,
  );
  for (const decoration of decorations) {
    cuts.add(Math.max(absoluteStart, decoration.startOffset));
    cuts.add(Math.min(absoluteEnd, decoration.endOffsetExclusive));
  }
  const boundaries = [...cuts].toSorted((left, right) => left - right);
  let decorationIndex = 0;
  return boundaries.flatMap((start, index) => {
    const end = boundaries[index + 1];
    if (end === undefined || end <= start) return [];
    const text = window.text.slice(start - absoluteStart, end - absoluteStart);
    const selected = selection !== undefined &&
      start >= selection.startOffset &&
      end <= selection.endOffsetExclusive;
    while ((decorations[decorationIndex]?.endOffsetExclusive ?? Number.POSITIVE_INFINITY) <= start) {
      decorationIndex += 1;
    }
    const candidate = decorations[decorationIndex];
    const decoration = !selected
      && candidate !== undefined
      && start >= candidate.startOffset
      && end <= candidate.endOffsetExclusive
      ? candidate
      : undefined;
    const placeholder = geometry.usesPlaceholder;
    const part: TextAreaStylePart = selected
      ? 'selection'
      : decoration === undefined
      ? placeholder ? 'placeholder' : active ? 'activeLine' : 'value'
      : 'decoration';
    const base: TerminalStyle = selected
      ? {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
      }
      : decoration === undefined
      ? {
        fg: { kind: 'theme', token: placeholder ? 'input.placeholder' : 'text.default' },
        ...(active
          ? { bg: { kind: 'theme' as const, token: 'editor.activeLine.background' as const } }
          : {}),
      }
      : {
        ...(active
          ? { bg: { kind: 'theme' as const, token: 'editor.activeLine.background' as const } }
          : {}),
        ...(decoration.style ?? {
              fg: { kind: 'theme' as const, token: 'menu.match' as const },
              underline: true
            }),
      };
    const availability = textAreaAvailabilityStates(input);
    const style = input.style({
      part,
      base,
      ...(selected
        ? {
          states: [
            ...availability,
            'selected' as const,
          ],
        }
        : availability.length === 0 ? {} : { states: availability }),
    });
    const description = selected ? 'selection' : decoration?.label ??
      (placeholder ? 'placeholder' : active ? 'activeLine.value' : 'value');
    return [span(text, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        cellRole: 'text',
        partName: part,
        partType: selected ? 'selection' : decoration === undefined ? part : 'decoration',
        description,
      }),
    })];
  });
}

function projectedStyleRangesBetween(
  ranges: readonly ProjectedTextStyleRange[],
  startOffset: number,
  endOffsetExclusive: number,
): readonly ProjectedTextStyleRange[] {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((ranges[middle]?.endOffsetExclusive ?? Number.POSITIVE_INFINITY) <= startOffset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  let end = low;
  while ((ranges[end]?.startOffset ?? Number.POSITIVE_INFINITY) < endOffsetExclusive) end += 1;
  return ranges.slice(low, end);
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
const sharedLogicalLineLayouts = new Map<string, TextAreaLogicalLineLayout>();
const sharedLogicalLineLayoutMaximumTextLength = 4_096;
const sharedLogicalLineLayoutWeightLimit = 1_048_576;
let sharedLogicalLineLayoutWeight = 0;

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
  let logicalLineStart = 0;
  for (let lineIndex = 0; lineIndex < logicalLines.length; lineIndex += 1) {
    logicalLineRowStarts.push(lines.length);
    const logical = logicalLines[lineIndex];
    if (logical === undefined) continue;
    intrinsicColumns = Math.max(intrinsicColumns, logical.intrinsicColumns);
    for (const visual of logical.visualLines) {
      lines.push({
        text: visual.text,
        start: logicalLineStart + visual.localStart,
        logicalLineIndex: lineIndex,
        firstVisualLine: visual.firstVisualLine,
        index: visual.index,
      });
    }
    logicalLineStart += logical.text.length + (lineIndex < logicalLines.length - 1 ? 1 : 0);
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
    if (line !== undefined) result[lineIndex] = layoutLogicalLine(line.text, width, wrap, widthProfile);
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

function layoutLogicalLine(
  text: string,
  width: number,
  wrap: boolean,
  widthProfile: TextWidthProfile,
): TextAreaLogicalLineLayout {
  const cacheKey = text.length <= sharedLogicalLineLayoutMaximumTextLength
    ? `${wrap ? 'wrap' : 'single'}:${String(width)}:${textWidthProfileKey(widthProfile)}\u0000${text}`
    : undefined;
  if (cacheKey !== undefined) {
    const cached = sharedLogicalLineLayouts.get(cacheKey);
    if (cached !== undefined) {
      sharedLogicalLineLayouts.delete(cacheKey);
      sharedLogicalLineLayouts.set(cacheKey, cached);
      return cached;
    }
  }
  const index = createTerminalTextIndex(text, { widthProfile });
  if (!wrap || width <= 0 || index.cells <= width || text === '') {
    return retainSharedLogicalLineLayout(cacheKey, Object.freeze({
      text,
      intrinsicColumns: index.cells,
      visualLines: Object.freeze([{ text, localStart: 0, firstVisualLine: true, index }]),
    }));
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
  return retainSharedLogicalLineLayout(cacheKey, Object.freeze({
    text,
    intrinsicColumns: index.cells,
    visualLines: Object.freeze(visualLines),
  }));
}

function retainSharedLogicalLineLayout(
  key: string | undefined,
  layout: TextAreaLogicalLineLayout,
): TextAreaLogicalLineLayout {
  if (key === undefined) return layout;
  sharedLogicalLineLayouts.set(key, layout);
  sharedLogicalLineLayoutWeight += key.length;
  while (sharedLogicalLineLayoutWeight > sharedLogicalLineLayoutWeightLimit) {
    const oldest = sharedLogicalLineLayouts.keys().next().value;
    if (oldest === undefined) break;
    sharedLogicalLineLayouts.delete(oldest);
    sharedLogicalLineLayoutWeight -= oldest.length;
  }
  return layout;
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
