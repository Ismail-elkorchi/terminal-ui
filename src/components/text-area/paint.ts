import type { ComponentInput, ComponentRenderInput } from '../../component/contracts.ts';
import { paintComponentScrollbar } from '../../component/scrollbar.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { Rect } from '../../geometry/types.ts';
import { textDocumentLineIndexAtOffset, textDocumentSelectionRange } from '../../text/document.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { VisualGraphemeSegment } from '../../text/presentation.ts';
import type { TerminalTextIndex, TextSelection } from '../../text/types.ts';
import { terminalStyleHasBackground } from '../../theme/theme.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { span } from '../../visual/render-content.ts';
import type { TextAreaStylePart } from '../style-parts.ts';
import type { TextAreaGeometry } from './geometry.ts';
import { projectedCaret, textAreaEditorHeight, textAreaGeometry, textAreaLayoutPending } from './geometry.ts';
import { type TextAreaLayoutLine } from './layout.ts';
import type { TextAreaModel } from './model.ts';
import { type ProjectedTextStyleRange } from './projection.ts';

export function paintTextArea(input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>): undefined {
  const visible = intersectRects(input.bounds, input.viewport);
  if (visible === undefined) return;
  if (textAreaLayoutPending(input)) {
    paintTextAreaPlane(input, input.bounds, input.style({ part: 'root' }), 'root.background', 'root');
    input.target.write(input.bounds.row, input.bounds.column, [span('Preparing editor…', {
      source: input.frameSource({ cellRole: 'text', partName: 'placeholder', partType: 'placeholder', description: 'layout.pending' }),
    })]);
    return;
  }
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
  const firstRow = Math.max(0, visible.row - content.row);
  const endRow = Math.min(content.height, visible.row + visible.height - content.row);
  const visibleContent = intersectRects(content, visible);
  for (let visibleRow = firstRow; visibleRow < endRow; visibleRow += 1) {
    const rowIndex = geometry.scrollbar.scroll.offsetRow + visibleRow;
    const line = geometry.layout.lineAtRow(rowIndex);
    if (line === undefined) break;
    const isActive = input.model.highlightActiveLine
      && line.logicalLineIndex === activeDisplayLine;
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
    paintTextAreaPrefix(input, geometry, line, visibleRow, isActive);
    if (visibleContent !== undefined) {
      const window = visibleTextWindow(
        line.index,
        geometry.scrollbar.scroll.offsetColumn,
        content.width,
        visibleContent.column - content.column,
        visibleContent.width,
      );
      const valueSpans = textAreaValueSpans(input, geometry, line, window, selection, isActive);
      input.target.write(content.row + visibleRow, content.column + window.columnOffset, valueSpans);
    }
  }
  paintComponentScrollbar({
    target: input.target,
    plan: geometry.scrollbar,
    viewport: visible,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
  paintTextAreaError(input, geometry);
}

function paintTextAreaPlane(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  bounds: Rect,
  style: TerminalStyle | undefined,
  description: string,
  partName: 'root' | 'gutter' | 'activeLine',
): void {
  const visible = intersectRects(bounds, input.viewport);
  if (visible === undefined || !terminalStyleHasBackground(style, input.theme)) return;
  // Editor allocations can be much larger than the terminal's writable window.
  const text = ' '.repeat(visible.width);
  for (let row = 0; row < visible.height; row += 1) {
    input.target.write(visible.row + row, visible.column, [span(text, {
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
  geometry: TextAreaGeometry,
): void {
  const localRow = textAreaEditorHeight(input.model, input.bounds.height);
  const index = geometry.errorIndex;
  if (index === undefined || localRow >= input.bounds.height) return;
  const row = input.bounds.row + localRow;
  const visible = intersectRects({ row, column: input.bounds.column, width: input.bounds.width, height: 1 }, input.viewport);
  if (visible === undefined) return;
  const window = visibleTextWindow(index, 0, input.bounds.width, visible.column - input.bounds.column, visible.width);
  const style = input.style({
    part: 'error',
    base: { fg: { kind: 'theme', token: 'status.error' }, bold: true },
  });
  input.target.write(row, input.bounds.column + window.columnOffset, [span(window.graphemes.map(grapheme => grapheme.text).join(''), {
    textOrder: 'visual',
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

function paintTextAreaPrefix(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  geometry: TextAreaGeometry,
  line: TextAreaLayoutLine,
  visibleRow: number,
  active: boolean,
): void {
  const availabilityStates = textAreaAvailabilityStates(input);
  const marker = textAreaGutterMarker(input, active, visibleRow);
  const markerStyle = input.style({
    part: active ? 'activeLine' : 'gutter',
    base: textAreaGutterStyle(input, active),
    ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
  });
  const row = geometry.scrollbar.contentBounds.row + visibleRow;
  if (input.model.lineNumbers === undefined) {
    input.target.write(row, input.bounds.column, [span(`${marker} `, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: active ? 'activeLine' : 'gutter',
        partType: active ? 'activeLine' : 'gutter',
        description: active ? 'activeLine.gutter' : 'gutter.prefix',
      }),
    })]);
    return;
  }
  const numbers = input.model.lineNumbers;
  const width = Math.max(
    numbers.minWidth,
    String(numbers.startNumber + Math.max(0, geometry.lineCount - 1)).length,
  );
  const lineNumber = line.firstVisualLine ? String(numbers.startNumber + line.logicalLineIndex) : '';
  const numberWidth = Math.max(width, lineNumber.length);
  const numberColumn = input.bounds.column + measureTextCells(marker, { widthProfile: input.widthProfile }).cells;
  const lineNumberStyle = input.style({
    part: 'lineNumber',
    base: textAreaLineNumberStyle(active),
    ...(availabilityStates.length === 0 ? {} : { states: availabilityStates }),
  });
  input.target.write(row, input.bounds.column, [span(marker, {
    ...(markerStyle === undefined ? {} : { style: markerStyle }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: active ? 'activeLine' : 'gutter',
      partType: 'marker',
      description: active ? 'activeLine.marker' : 'gutter.marker',
    }),
  })]);
  const visibleNumber = intersectRects({ row, column: numberColumn, width: numberWidth, height: 1 }, input.viewport);
  if (visibleNumber !== undefined) {
    const paddingWidth = numberWidth - lineNumber.length;
    const start = visibleNumber.column - numberColumn;
    const end = start + visibleNumber.width;
    const padding = ' '.repeat(Math.max(0, Math.min(end, paddingWidth) - start));
    const text = padding + lineNumber.slice(Math.max(0, start - paddingWidth), Math.max(0, end - paddingWidth));
    input.target.write(row, visibleNumber.column, [span(text, {
      ...(lineNumberStyle === undefined ? {} : { style: lineNumberStyle }),
      source: input.frameSource({
        cellRole: 'decoration',
        partName: 'lineNumber',
        partType: 'lineNumber',
        description: active ? 'activeLine.lineNumber' : 'lineNumber',
      }),
    })]);
  }
  input.target.write(row, numberColumn + numberWidth, [span(` ${input.theme.tokens.symbols.borderSingle.vertical} `, {
    ...(markerStyle === undefined ? {} : { style: markerStyle }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: active ? 'activeLine' : 'gutter',
      partType: 'gutter',
      description: active ? 'activeLine.gutter' : 'gutter.separator',
    }),
  })]);
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
  readonly graphemes: readonly VisualGraphemeSegment[];
  readonly columnOffset: number;
}

function visibleTextWindow(
  index: TerminalTextIndex,
  offsetColumn: number,
  width: number,
  visibleOffset: number,
  visibleWidth: number,
): VisibleTextWindow {
  // Scroll positions snap to a complete glyph. Viewport clipping retains a
  // partially visible leading glyph so the render target clears its clipped cells.
  const scrollPosition = index.visualColumnToPosition(Math.max(0, offsetColumn));
  const scrollColumn = index.positionToVisualColumn(scrollPosition);
  const startPosition = index.visualColumnToPosition(scrollColumn + visibleOffset);
  const startColumn = index.positionToVisualColumn(startPosition);
  const endColumn = Math.min(offsetColumn + width, scrollColumn + visibleOffset + visibleWidth);
  return {
    graphemes: index.visualGraphemesInColumns(startColumn, endColumn),
    columnOffset: startColumn - scrollColumn,
  };
}

function textAreaValueSpans(
  input: ComponentRenderInput<TextAreaModel, TextAreaStylePart>,
  geometry: TextAreaGeometry,
  line: TextAreaLayoutLine,
  window: VisibleTextWindow,
  selection: TextSelection | undefined,
  active: boolean,
): readonly RenderSpan[] {
  const spans: RenderSpan[] = [];
  let pending: TextAreaValueSegment | undefined;
  let text = '';
  for (const grapheme of window.graphemes) {
    const start = line.start + grapheme.startOffset;
    const end = line.start + grapheme.endOffsetExclusive;
    const segment = textAreaValueSegment(selection,
      projectedStyleAt(geometry.projection.styleRanges, start), start, end,
      geometry.usesPlaceholder, active);
    if (pending !== undefined && (pending.part !== segment.part
      || pending.decoration !== segment.decoration)) {
      spans.push(textAreaValueSegmentSpan(input, text, pending, active));
      text = '';
    }
    pending = segment;
    text += grapheme.text;
  }
  if (pending !== undefined) spans.push(textAreaValueSegmentSpan(input, text, pending, active));
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
    textOrder: 'visual',
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

function projectedStyleAt(
  ranges: readonly ProjectedTextStyleRange[],
  offset: number,
): ProjectedTextStyleRange | undefined {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((ranges[middle]?.endOffsetExclusive ?? Number.POSITIVE_INFINITY) <= offset) low = middle + 1;
    else high = middle;
  }
  const candidate = ranges[low];
  return candidate !== undefined && candidate.startOffset <= offset ? candidate : undefined;
}
