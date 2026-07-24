import { normalizeScrollState } from '../../../behavior/scroll.ts';
import {
  prepareTextDocument,
  textDocumentLength,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset
} from '../../../text/index.ts';
import { textAreaCursorInProjection } from './projection.ts';
import type { TextDocument, TextWidthProfile } from '../../../text/index.ts';
import type { TerminalTheme } from '../../../theme/index.ts';
import type { RenderNodeOfKind } from '../../model/index.ts';
import type { Rect } from '../../model/layout.ts';
import { textAreaInputContentBounds } from '../input-visual.ts';
import { projectTextAreaDocument } from './projection.ts';
import type { TextAreaDocumentProjection } from './projection.ts';

type TextAreaNode = RenderNodeOfKind<unknown, 'textArea'>;

export interface TextAreaRenderModel {
  readonly document: TextDocument;
  readonly usesPlaceholder: boolean;
  readonly lineCount: number;
  readonly contentBounds: Rect;
  readonly projection: TextAreaDocumentProjection;
  readonly scroll: ReturnType<typeof normalizeScrollState>;
  readonly activeLineIndex?: number;
}

export function textAreaRenderModel(
  renderNode: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): TextAreaRenderModel {
  const source = renderNode.props.document;
  const placeholder = renderNode.props.placeholder ?? '';
  const usesPlaceholder = textDocumentLength(source) === 0 && placeholder.length > 0;
  const document = usesPlaceholder ? prepareTextDocument(placeholder) : source;
  const lineCount = textDocumentLineCount(document);
  const contentBounds = textAreaInputContentBounds(bounds, theme, widthProfile, renderNode, lineCount);
  const projection = projectTextAreaDocument(
    document,
    contentBounds.width,
    textAreaWrapEnabled(renderNode),
    widthProfile
  );
  const raw = renderNode.props.scroll;
  const baseScroll = normalizeScrollState({
    offsetRow: raw?.offsetRow ?? 0,
    offsetColumn: raw?.offsetColumn ?? 0,
    contentRows: projection.contentRows,
    contentColumns: projection.contentColumns,
    viewportRows: contentBounds.height,
    viewportColumns: contentBounds.width,
    followTail: raw?.followTail === true,
    ...(raw?.selectedIndex === undefined ? {} : { selectedIndex: raw.selectedIndex })
  });
  const scroll = usesPlaceholder || renderNode.props.revealCaret !== true
    ? baseScroll
    : revealCaret(baseScroll, textAreaCursorInProjection(projection, renderNode.props.caret));
  return {
    document,
    usesPlaceholder,
    lineCount,
    contentBounds,
    projection,
    scroll,
    ...(usesPlaceholder
      ? {}
      : { activeLineIndex: textDocumentLineIndexAtOffset(source, renderNode.props.caret.position.offset) })
  };
}

function revealCaret(
  scroll: ReturnType<typeof normalizeScrollState>,
  caret: ReturnType<typeof textAreaCursorInProjection>
): ReturnType<typeof normalizeScrollState> {
  const lastRow = scroll.offsetRow + Math.max(0, scroll.viewportRows - 1);
  const lastColumn = scroll.offsetColumn + Math.max(0, scroll.viewportColumns - 1);
  return normalizeScrollState({
    ...scroll,
    offsetRow: caret.rowIndex < scroll.offsetRow
      ? caret.rowIndex
      : caret.rowIndex > lastRow
        ? caret.rowIndex - Math.max(0, scroll.viewportRows - 1)
        : scroll.offsetRow,
    offsetColumn: caret.columnCells < scroll.offsetColumn
      ? caret.columnCells
      : caret.columnCells > lastColumn
        ? caret.columnCells - Math.max(0, scroll.viewportColumns - 1)
        : scroll.offsetColumn,
    followTail: false
  });
}

export function textAreaWrapEnabled(renderNode: TextAreaNode): boolean {
  const raw = renderNode.props.wrap;
  return raw === true || typeof raw === 'object' && (raw.mode === undefined || raw.mode === 'soft');
}
