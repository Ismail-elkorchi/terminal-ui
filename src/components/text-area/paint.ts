import type { ComponentInput, ComponentRenderInput } from '../../component/contracts.ts';
import { paintComponentScrollbar } from '../../component/scrollbar.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { Rect } from '../../geometry/types.ts';
import { textDocumentLineIndexAtOffset, textDocumentSelectionRange } from '../../text/document.ts';
import { measureTextCells } from '../../text/measure.ts';
import type { TextSelection } from '../../text/types.ts';
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
        line,
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
  paintTextAreaError(input);
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
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly columnOffset: number;
}

function visibleTextWindow(
  line: TextAreaLayoutLine,
  offsetColumn: number,
  width: number,
  visibleOffset: number,
  visibleWidth: number,
): VisibleTextWindow {
  const logicalStart = line.index.visualColumnToGraphemeIndex(Math.max(0, offsetColumn));
  // The existing scroll window snaps to a grapheme. Clip in its painted cell
  // coordinates so partial wide glyphs stay at the same columns for the target.
  const logicalColumn = line.index.graphemeIndexToVisualColumn(logicalStart);
  const startGrapheme = line.index.visualColumnToGraphemeIndex(logicalColumn + visibleOffset);
  const endGrapheme = Math.min(
    line.index.visualColumnToGraphemeIndex(Math.max(0, offsetColumn + width)),
    line.index.visualColumnToGraphemeIndex(logicalColumn + visibleOffset + visibleWidth),
  );
  const startOffset = line.index.graphemeIndexToCodeUnitOffset(startGrapheme);
  const endOffset = line.index.graphemeIndexToCodeUnitOffset(endGrapheme);
  const columnOffset = line.index.graphemeIndexToVisualColumn(startGrapheme) - logicalColumn;
  return { text: line.text.slice(startOffset, endOffset), startOffset, endOffset, columnOffset };
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
