import {
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  layoutComponentScrollbar,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
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
  textDocumentSelectionRange,
  textDocumentText,
} from '../../text/index.ts';
import type {
  RowOffsetMap,
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
  TextAreaLineNumberOptions,
  TextAreaWrapOptions,
} from '../text-area.ts';
import {
  emptyTextAreaDecorations,
  readTextAreaDecorations,
  type TextAreaDecorations,
} from '../text-area-decorations.ts';
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
  type ProjectedTextStyleRange,
  type TextAreaProjection
} from '../internal/text-area-projection.ts';
import {
  layoutTextAreaDocument,
  type TextAreaDocumentLayout,
  type TextAreaLayoutLine,
} from '../internal/text-area-layout.ts';

export interface TextAreaRowOffsetMapOptions {
  readonly document: TextDocument;
  readonly terminalWidth: number;
  readonly terminalRows: number;
  readonly decorations?: TextAreaDecorations;
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
    const displayCaret = projectedCaret(geometry.projection, input.model.caret);
    const caret = geometry.layout.cursorAt(
      displayCaret.position.offset,
      displayCaret.position.affinity,
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
    const geometry = textAreaGeometry(input);
    const scroll = geometry.scrollbar.scroll;
    const scrollGeometry = geometry.scrollbar.geometry;
    const visibleRows = Math.min(scrollGeometry.contentRows, scrollGeometry.viewportRows);
    const start = visibleRows === 0 ? 0 : scroll.offsetRow + 1;
    const end = visibleRows === 0
      ? 0
      : Math.min(scrollGeometry.contentRows, scroll.offsetRow + visibleRows);
    const logicalLines = geometry.usesPlaceholder
      ? 0
      : geometry.projection.accessibilityLineCount();
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
    const accessibilityWindow = geometry.usesPlaceholder
      ? undefined
      : geometry.projection.accessibilityWindow(
          accessibilityCaret,
          Math.min(
            65_536,
            Math.max(4_096, scrollGeometry.viewportRows * input.bounds.width * 8),
          ),
        );
    return {
      id,
      role: 'textbox',
      value: accessibilityWindow?.text ?? textDocumentText(model.document),
      ...(accessibilityWindow === undefined ? {} : {
        textWindow: {
          startOffset: accessibilityWindow.startOffset,
          endOffsetExclusive: accessibilityWindow.endOffsetExclusive,
          totalLength: accessibilityWindow.totalLength,
        },
      }),
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

function textAreaDecorationsForDocument(
  decorations: TextAreaDecorations | undefined,
  document: TextDocument,
): TextAreaDecorations {
  const value = decorations ?? emptyTextAreaDecorations(document);
  if (readTextAreaDecorations(value).document !== document) {
    throw new TypeError('Text area decorations must be created for the current text document.');
  }
  return value;
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
  const decorations = textAreaDecorationsForDocument(options.decorations, options.document);
  const projection = createTextAreaProjection(
    options.document,
    readTextAreaDecorations(decorations).decorations,
    widthProfile,
  );
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
  return createRowOffsetMap(layout.allRowStartOffsets().map((displayOffset) => (
    projection.sourceOffsetAtDisplayOffset(displayOffset, 'upstream')
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
  const displayCaret = projectedCaret(geometry.projection, input.model.caret);
  const activeDisplayLine = textDocumentLineIndexAtOffset(
    geometry.document,
    displayCaret.position.offset,
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
    const line = geometry.layout.lineAtRow(rowIndex);
    if (line === undefined) break;
    const isActive = input.model.highlightActiveLine
      && line.logicalLineIndex === activeDisplayLine;
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
      geometry.layout.contentRows - 1,
      geometry.scrollbar.scroll.offsetRow + row - 1,
    ),
  );
  const line = geometry.layout.lineAtRow(rowIndex);
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
    usesPlaceholder
      ? readTextAreaDecorations(emptyTextAreaDecorations(source)).decorations
      : readTextAreaDecorations(model.decorations).decorations,
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
  const marker = textAreaGutterMarker(input, active, visibleRow);
  const markerStyle = input.style({
    part: active ? 'activeLine' : 'gutter',
    base: textAreaGutterStyle(input, active),
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
    base: textAreaLineNumberStyle(active),
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

function textAreaGutterMarker(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  active: boolean,
  visibleRow: number,
): string {
  if (active) {
    return input.focus === 'self' ? input.theme.tokens.symbols.pointer : input.theme.tokens.symbols.selected;
  }
  if (visibleRow !== 0) return input.theme.tokens.symbols.borderSingle.vertical;
  if (input.disabled) return ' ';
  if (input.model.error !== '') return input.theme.tokens.symbols.statusError;
  return input.focus === 'self'
    ? input.theme.tokens.symbols.pointer
    : input.theme.tokens.symbols.borderSingle.vertical;
}

function textAreaGutterStyle(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  active: boolean,
): TerminalStyle {
  return active
    ? textAreaActiveLineStyle
    : {
      fg: {
        kind: 'theme',
        token: input.model.error !== '' ? 'status.error' : 'editor.gutter.foreground',
      },
      bg: { kind: 'theme', token: 'editor.gutter.background' },
    };
}

function textAreaLineNumberStyle(active: boolean): TerminalStyle {
  return active
    ? textAreaActiveLineStyle
    : {
      fg: { kind: 'theme', token: 'editor.gutter.foreground' },
      bg: { kind: 'theme', token: 'editor.gutter.background' },
    };
}

const textAreaActiveLineStyle = Object.freeze<TerminalStyle>({
  fg: { kind: 'theme', token: 'editor.gutter.active.foreground' },
  bg: { kind: 'theme', token: 'editor.activeLine.background' },
  bold: true,
});

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
  const spans: RenderSpan[] = [];
  for (const [index, start] of boundaries.entries()) {
    const end = boundaries[index + 1];
    if (end === undefined || end <= start) continue;
    const text = window.text.slice(start - absoluteStart, end - absoluteStart);
    while ((decorations[decorationIndex]?.endOffsetExclusive ?? Number.POSITIVE_INFINITY) <= start) {
      decorationIndex += 1;
    }
    const segment = textAreaValueSegment(
      selection,
      decorations[decorationIndex],
      start,
      end,
      geometry.usesPlaceholder,
      active,
    );
    spans.push(textAreaValueSegmentSpan(input, text, segment, active));
  }
  return spans;
}

interface TextAreaValueSegment {
  readonly selected: boolean;
  readonly placeholder: boolean;
  readonly decoration?: ProjectedTextStyleRange;
  readonly part: TextAreaStylePart;
  readonly description: string;
}

function textAreaValueSegment(
  selection: TextSelection | undefined,
  candidate: ProjectedTextStyleRange | undefined,
  start: number,
  end: number,
  placeholder: boolean,
  active: boolean,
): TextAreaValueSegment {
  const selected = selection !== undefined
    && start >= selection.startOffset
    && end <= selection.endOffsetExclusive;
  const decoration = !selected && candidate !== undefined
    && start >= candidate.startOffset
    && end <= candidate.endOffsetExclusive
    ? candidate
    : undefined;
  const part: TextAreaStylePart = selected
    ? 'selection'
    : decoration !== undefined
      ? 'decoration'
      : placeholder
        ? 'placeholder'
        : active ? 'activeLine' : 'value';
  const description = selected
    ? 'selection'
    : decoration?.label ?? (placeholder ? 'placeholder' : active ? 'activeLine.value' : 'value');
  return { selected, placeholder, ...(decoration === undefined ? {} : { decoration }), part, description };
}

function textAreaValueSegmentSpan(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  text: string,
  segment: TextAreaValueSegment,
  active: boolean,
): RenderSpan {
  const base = textAreaValueSegmentBase(segment, active);
  const availability = textAreaAvailabilityStates(input);
  const style = input.style({
    part: segment.part,
    base,
    ...(segment.selected
      ? { states: [...availability, 'selected' as const] }
      : availability.length === 0 ? {} : { states: availability }),
  });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'text',
      partName: segment.part,
      partType: segment.selected ? 'selection' : segment.decoration === undefined ? segment.part : 'decoration',
      description: segment.description,
    }),
  });
}

function textAreaValueSegmentBase(segment: TextAreaValueSegment, active: boolean): TerminalStyle {
  if (segment.selected) {
    return {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    };
  }
  const activeBackground: TerminalStyle = active
    ? { bg: { kind: 'theme', token: 'editor.activeLine.background' } }
    : {};
  if (segment.decoration !== undefined) {
    return {
      ...activeBackground,
      ...(segment.decoration.style ?? {
        fg: { kind: 'theme', token: 'menu.match' },
        underline: true,
      }),
    };
  }
  return {
    fg: { kind: 'theme', token: segment.placeholder ? 'input.placeholder' : 'text.default' },
    ...activeBackground,
  };
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
