import { sanitizeTerminalText } from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type {
  BorderTitle as BorderTitleInput,
  BorderTitleContent as BorderTitleContentInput,
  BorderTitleSlots as BorderTitleSlotsInput
} from '../../visual/border.ts';
import type { FrameCellSource, TerminalStyle } from '../../visual/render-content.ts';
import { span } from '../../visual/render-content.ts';
import type { BorderTitle, BorderTitleContent, BorderTitleSlots } from '../border.ts';
import { renderInlineContent } from './inline-content.ts';

export interface BorderTitleRenderOptions {
  readonly theme: TerminalTheme;
  readonly baseStyle?: TerminalStyle;
  readonly source: (part: string, index: number) => FrameCellSource;
}

export function renderBorderTitle(
  title: BorderTitleInput | undefined,
  options: BorderTitleRenderOptions
): BorderTitle | undefined {
  if (title === undefined) return undefined;
  if (isTitleSlots(title)) {
    const slots: BorderTitleSlots = {
      ...renderTitleSlot('start', title.start, options),
      ...renderTitleSlot('center', title.center, options),
      ...renderTitleSlot('end', title.end, options)
    };
    return Object.keys(slots).length === 0 ? undefined : slots;
  }
  return renderTitleContent(title, 'title', options);
}

function renderTitleSlot<TKey extends keyof BorderTitleSlotsInput>(
  key: TKey,
  content: BorderTitleContentInput | undefined,
  options: BorderTitleRenderOptions
): Pick<BorderTitleSlots, TKey> | Record<string, never> {
  if (content === undefined) return {};
  const rendered = renderTitleContent(content, `title.${key}`, options);
  return rendered === undefined ? {} : { [key]: rendered } as Pick<BorderTitleSlots, TKey>;
}

function renderTitleContent(
  content: BorderTitleContentInput,
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

function isTitleSlots(title: BorderTitleInput): title is BorderTitleSlotsInput {
  return typeof title === 'object'
    && !Array.isArray(title)
    && ('start' in title || 'center' in title || 'end' in title);
}
