import type { ComponentRenderInput } from '../../component/contracts.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import { inlineSegmentText } from '../../visual/inline-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { span } from '../../visual/render-content.ts';
import type { HelpBarStylePart, StatusBarStylePart } from '../style-parts.ts';

type StatusVisualPart = StatusBarStylePart | HelpBarStylePart;

export type StatusVisualInput<TModel extends object, TPart extends StatusVisualPart> = Pick<
  ComponentRenderInput<TModel, TPart>,
  'id' | 'model' | 'theme' | 'widthProfile' | 'textPresentation' | 'style' | 'frameSource'
>;

type StatusPaintInput<TPart extends StatusVisualPart> = Pick<
  ComponentRenderInput<object, TPart>, 'style' | 'frameSource'
>;

export function statusInlineSpans(
  input: Pick<ComponentRenderInput<object, StatusBarStylePart>, 'style' | 'frameSource' | 'theme'>,
  content: InlineContent | undefined,
  partName: string,
  part: 'leading' | 'trailing',
  itemId: string,
): readonly RenderSpan[] {
  if (content === undefined) return [];
  return content.map((segment, index) => {
    const style = input.style({
      part,
      ...(segment.style === undefined ? {} : { base: segment.style }),
    });
    return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source: input.frameSource({
        cellRole: 'text',
        partName: `${partName}.${String(index)}`,
        partType: part,
        itemId,
      }),
    });
  });
}

export function statusGap(input: StatusPaintInput<'marker' | 'value'>, partName: string): RenderSpan {
  return statusSpan(input, '  ', 'marker', partName, { cellRole: 'separator' });
}

export function fillSpans(input: StatusPaintInput<'marker' | 'value'>, cells: number): readonly RenderSpan[] {
  return cells <= 0 ? [] : [statusSpan(input, ' '.repeat(cells), 'value', 'fill', {
    cellRole: 'decoration',
    base: { bg: { kind: 'theme', token: 'surface.bar.background' } },
  })];
}

export function statusSpan<TPart extends StatusVisualPart>(
  input: StatusPaintInput<TPart>,
  textValue: string,
  part: TPart,
  partName: string,
  options: {
    readonly itemId?: string;
    readonly cellRole?: import('../../visual/frame-source.ts').FrameCellRole;
    readonly base?: TerminalStyle;
  } = {},
): RenderSpan {
  const barBase: TerminalStyle = {
    bg: { kind: 'theme', token: 'surface.bar.background' },
    ...options.base,
  };
  const style = input.style({ part, base: barBase });
  return span(textValue, {
    ...(options.cellRole === 'decoration' || options.cellRole === 'separator' ? { textOrder: 'visual' as const } : {}),
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: options.cellRole ?? 'text',
      partName,
      partType: 'status',
      ...(options.itemId === undefined ? {} : { itemId: options.itemId }),
    }),
  });
}
