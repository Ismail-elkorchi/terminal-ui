import { normalizeScrollState } from '../../../behavior/scroll.ts';
import { prepareTextDocument, textDocumentLineIndexAtOffset } from '../../../text/index.ts';
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
  widget: TextAreaNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): TextAreaRenderModel {
  const source = widget.props.document;
  const placeholder = widget.props.placeholder ?? '';
  const usesPlaceholder = source.text.length === 0 && placeholder.length > 0;
  const document = usesPlaceholder ? prepareTextDocument(placeholder) : source;
  const contentBounds = textAreaInputContentBounds(bounds, theme, widthProfile, widget, document.lineCount);
  const projection = projectTextAreaDocument(
    document,
    contentBounds.width,
    textAreaWrapEnabled(widget),
    widthProfile
  );
  const raw = widget.props.scroll;
  const scroll = normalizeScrollState({
    offsetRow: raw?.offsetRow ?? 0,
    offsetColumn: raw?.offsetColumn ?? 0,
    contentRows: projection.contentRows,
    contentColumns: projection.contentColumns,
    viewportRows: contentBounds.height,
    viewportColumns: contentBounds.width,
    followTail: raw?.followTail === true,
    ...(raw?.selectedIndex === undefined ? {} : { selectedIndex: raw.selectedIndex })
  });
  return {
    document,
    usesPlaceholder,
    lineCount: document.lineCount,
    contentBounds,
    projection,
    scroll,
    ...(usesPlaceholder
      ? {}
      : { activeLineIndex: textDocumentLineIndexAtOffset(source, widget.props.cursor ?? source.text.length) })
  };
}

export function textAreaWrapEnabled(widget: TextAreaNode): boolean {
  const raw = widget.props.wrap;
  return raw === true || typeof raw === 'object' && (raw.mode === undefined || raw.mode === 'soft');
}
