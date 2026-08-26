import type { TerminalTheme } from '../../theme/index.ts';
import type { FrameCellSource } from '../../visual/frame-source.ts';
import {
  inlineSegmentText
} from '../../visual/inline-content.ts';
import type {
  InlineContent,
  InlineContentSegment
} from '../../visual/inline-content.ts';
import { span } from '../../visual/render-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { mergeStyles, themeStyle } from '../style-resolution.ts';

export interface InlineContentRenderOptions {
  readonly theme: TerminalTheme;
  readonly baseStyle?: TerminalStyle;
  readonly source: (segment: InlineContentSegment, index: number) => FrameCellSource;
}

export function renderInlineContent(
  content: InlineContent,
  options: InlineContentRenderOptions
): readonly RenderSpan[] {
  return content.map((segment, index) => span(
    inlineSegmentText(segment, options.theme.tokens.symbols.mode),
    {
      ...styleOption(mergeStyles(
        options.baseStyle,
        segment.link === undefined ? undefined : themeStyle('link.foreground', { underline: true }),
        segment.style
      )),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source: options.source(segment, index)
    }
  ));
}

function styleOption(style: TerminalStyle | undefined): { readonly style?: TerminalStyle } {
  return style === undefined ? {} : { style };
}
