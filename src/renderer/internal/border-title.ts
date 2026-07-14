import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type {
  BorderTitle as AuthoredBorderTitle,
  BorderTitleContent as AuthoredBorderTitleContent,
  BorderTitleRail as AuthoredBorderTitleRail
} from '../../visual/border.ts';
import type { FrameCellSource, TerminalStyle } from '../../visual/render.ts';
import { span } from '../../visual/render.ts';
import type { BorderTitle, BorderTitleContent, BorderTitleRail } from './border.ts';
import { renderInlineContent } from './inline-content.ts';

export interface BorderTitleRenderOptions {
  readonly theme: TerminalTheme;
  readonly baseStyle?: TerminalStyle;
  readonly source: (part: string, index: number) => FrameCellSource;
}

export function renderBorderTitle(
  title: AuthoredBorderTitle | undefined,
  options: BorderTitleRenderOptions
): BorderTitle | undefined {
  if (title === undefined) return undefined;
  if (isTitleRail(title)) {
    const rail: BorderTitleRail = {
      ...renderRailPart('start', title.start, options),
      ...renderRailPart('center', title.center, options),
      ...renderRailPart('end', title.end, options)
    };
    return Object.keys(rail).length === 0 ? undefined : rail;
  }
  return renderTitleContent(title, 'title', options);
}

function renderRailPart<TKey extends keyof AuthoredBorderTitleRail>(
  key: TKey,
  content: AuthoredBorderTitleContent | undefined,
  options: BorderTitleRenderOptions
): Pick<BorderTitleRail, TKey> | Record<string, never> {
  if (content === undefined) return {};
  const rendered = renderTitleContent(content, `title.${key}`, options);
  return rendered === undefined ? {} : { [key]: rendered } as Pick<BorderTitleRail, TKey>;
}

function renderTitleContent(
  content: AuthoredBorderTitleContent,
  part: string,
  options: BorderTitleRenderOptions
): BorderTitleContent | undefined {
  if (typeof content === 'string') {
    const text = sanitizeTerminalText(content).text;
    return text.length === 0
      ? undefined
      : [span(text, {
          ...(options.baseStyle === undefined ? {} : { style: options.baseStyle }),
          source: options.source(part, 0)
        })];
  }
  const spans = renderInlineContent(content, {
    theme: options.theme,
    ...(options.baseStyle === undefined ? {} : { baseStyle: options.baseStyle }),
    source: (_segment, index) => options.source(part, index)
  });
  return spans.length === 0 ? undefined : spans;
}

function isTitleRail(title: AuthoredBorderTitle): title is AuthoredBorderTitleRail {
  return typeof title === 'object'
    && !Array.isArray(title)
    && ('start' in title || 'center' in title || 'end' in title);
}
