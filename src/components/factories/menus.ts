import { defineComponent } from '../../component/index.ts';
import type {
  SemanticCompositeComponentFactory,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { DividerOptions, TooltipOptions } from '../options/menus.ts';
import type { DividerLineKind, DividerOrientation } from '../../ui-model/menu.ts';
import type { DividerStylePart } from '../../ui-model/style-parts.ts';
import {
  clipTextCells,
  measureTextCells,
  oneCellGlyph,
  sanitizeTerminalText,
} from '../../text/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { portal, surface } from '../../layout/index.ts';
import { text } from './content.ts';
import type { TooltipPresentation, TooltipTone } from '../../ui-model/menu.ts';
import type { TooltipStylePart } from '../../ui-model/style-parts.ts';
import type { BorderOptions } from '../../visual/border.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import { assertKnownOptions } from '../internal/options.ts';

interface PreparedDivider {
  readonly orientation: DividerOrientation;
  readonly line: DividerLineKind;
  readonly label: string;
  readonly labelAlign: 'start' | 'center' | 'end';
}

export const divider: SemanticLeafComponentFactory<
  Omit<DividerOptions, 'id' | 'meta'>,
  never,
  DividerStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Omit<DividerOptions, 'id' | 'meta'>,
  PreparedDivider,
  never,
  DividerStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/divider',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['line', 'label'],
  prepare(value) {
    assertKnownOptions(value, ['orientation', 'line', 'label', 'labelAlign'], 'divider');
    const orientation = value.orientation;
    const line = value.line;
    const label = value.label;
    const labelAlign = value.labelAlign;
    if (orientation !== undefined && orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new TypeError('divider orientation must be "horizontal" or "vertical".');
    }
    if (line !== undefined && !isDividerLineKind(line)) {
      throw new TypeError('divider line is invalid.');
    }
    if (label !== undefined && typeof label !== 'string') {
      throw new TypeError('divider label must be a string.');
    }
    if (
      labelAlign !== undefined &&
      labelAlign !== 'start' &&
      labelAlign !== 'center' &&
      labelAlign !== 'end'
    ) {
      throw new TypeError('divider labelAlign must be "start", "center", or "end".');
    }
    return {
      orientation: orientation ?? 'horizontal',
      line: line ?? 'single',
      label: label === undefined ? '' : sanitizeTerminalText(label).text,
      labelAlign: labelAlign ?? 'start',
    };
  },
  measure({ model, widthProfile }) {
    const labelCells = measureTextCells(model.label, { widthProfile }).cells;
    return model.orientation === 'vertical'
      ? { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: Math.max(1, labelCells) }
      : {
        minWidth: 1,
        minHeight: 1,
        preferredWidth: Math.max(1, labelCells + (labelCells === 0 ? 0 : 2)),
        preferredHeight: 1,
      };
  },
  render({ model, bounds, target, theme, style, source, widthProfile }) {
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const glyphs = dividerGlyphs(model.line, theme);
    const lineStyle = style({
      part: 'line',
      base: { fg: { kind: 'theme', token: 'surface.border' } },
    });
    if (model.orientation === 'vertical') {
      const glyph = oneCellGlyph(glyphs.vertical, '|', { widthProfile });
      for (let row = 0; row < bounds.height; row += 1) {
        target.write(row, 0, [{
          text: glyph,
          ...(lineStyle === undefined ? {} : { style: lineStyle }),
          source: source({ cellRole: 'separator', partName: 'line', partType: 'separator' }),
        }]);
      }
      return;
    }
    const glyph = oneCellGlyph(glyphs.horizontal, '-', { widthProfile });
    const label = model.label.length === 0
      ? ''
      : clipTextCells(` ${model.label} `, bounds.width, { widthProfile }).text;
    const labelWidth = measureTextCells(label, { widthProfile }).cells;
    const remaining = Math.max(0, bounds.width - labelWidth);
    const before = model.labelAlign === 'end'
      ? remaining
      : model.labelAlign === 'center'
      ? Math.floor(remaining / 2)
      : 0;
    const after = remaining - before;
    const labelStyle = style({
      part: 'label',
      ...(lineStyle === undefined ? {} : { base: lineStyle }),
    });
    target.write(
      0,
      0,
      [
        {
          text: glyph.repeat(before),
          ...(lineStyle === undefined ? {} : { style: lineStyle }),
          source: source({
            cellRole: 'separator',
            partName: label.length === 0 ? 'line' : 'separator.before',
            partType: 'separator',
          }),
        },
        {
          text: label,
          ...(labelStyle === undefined ? {} : { style: labelStyle }),
          source: source({ cellRole: 'text', partName: 'label', partType: 'text' }),
        },
        {
          text: glyph.repeat(after),
          ...(lineStyle === undefined ? {} : { style: lineStyle }),
          source: source({
            cellRole: 'separator',
            partName: label.length === 0 ? 'line' : 'separator.after',
            partType: 'separator',
          }),
        },
      ].filter((span) => span.text.length > 0),
    );
  },
  accessibility({ id, model }) {
    return { id, role: 'text', label: model.label.length === 0 ? id : model.label };
  },
});

function isDividerLineKind(value: unknown): value is DividerLineKind {
  return value === 'single' ||
    value === 'double' ||
    value === 'heavy' ||
    value === 'dashed' ||
    value === 'dotted' ||
    value === 'ascii' ||
    value === 'empty';
}

function dividerGlyphs(
  line: DividerLineKind,
  theme: TerminalTheme,
): { readonly horizontal: string; readonly vertical: string } {
  switch (line) {
    case 'single':
      return theme.tokens.symbols.borderSingle;
    case 'double':
      return { horizontal: '═', vertical: '║' };
    case 'heavy':
      return { horizontal: '━', vertical: '┃' };
    case 'dashed':
      return { horizontal: '┄', vertical: '┆' };
    case 'dotted':
      return { horizontal: '┈', vertical: '┊' };
    case 'ascii':
      return { horizontal: '-', vertical: '|' };
    case 'empty':
      return { horizontal: ' ', vertical: ' ' };
  }
}

interface TooltipModel {
  readonly lines: readonly string[];
  readonly presentation: TooltipPresentation;
  readonly title: string;
  readonly tone: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth: number;
  readonly border: BorderOptions;
}

export const tooltip: SemanticCompositeComponentFactory<
  Pick<
    TooltipOptions,
    'content' | 'presentation' | 'title' | 'tone' | 'placement' | 'maxWidth' | 'border'
  >,
  never,
  TooltipStylePart,
  readonly [],
  'optional',
  readonly ['styles']
> = defineComponent<
  Pick<
    TooltipOptions,
    'content' | 'presentation' | 'title' | 'tone' | 'placement' | 'maxWidth' | 'border'
  >,
  TooltipModel,
  never,
  TooltipStylePart,
  readonly [],
  'optional',
  readonly ['styles']
>({
  name: 'terminal-ui/components/tooltip',
  identity: 'optional',
  structure: 'composed',
  semantics: 'semantic',
  metadata: ['styles'],
  parts: ['background', 'border', 'title', 'content'],
  prepare(value) {
    assertKnownOptions(
      value,
      ['content', 'presentation', 'title', 'tone', 'placement', 'maxWidth', 'border'],
      'tooltip',
    );
    const content = value.content;
    const presentation = prepareTooltipPresentation(value.presentation);
    const title = value.title;
    const tone = value.tone;
    const placement = value.placement;
    const maxWidth = value.maxWidth;
    if (typeof content !== 'string' && !isStringArray(content)) {
      throw new TypeError('tooltip content must be a string or an array of strings.');
    }
    if (title !== undefined && typeof title !== 'string') {
      throw new TypeError('tooltip title must be a string.');
    }
    if (tone !== undefined && !isTooltipTone(tone)) throw new TypeError('tooltip tone is invalid.');
    if (placement !== undefined && !isAnchoredPlacement(placement)) {
      throw new TypeError('tooltip placement is invalid.');
    }
    if (
      maxWidth !== undefined &&
      (typeof maxWidth !== 'number' || !Number.isFinite(maxWidth) || maxWidth < 4)
    ) {
      throw new RangeError('tooltip maxWidth must be a finite number of at least 4.');
    }
    const lines = (typeof content === 'string' ? content.split('\n') : content)
      .map((line) => sanitizeTerminalText(line).text);
    return {
      lines: lines.length === 0 ? [''] : lines,
      presentation,
      title: title === undefined ? '' : sanitizeTerminalText(title).text,
      tone: tone ?? 'default',
      ...(placement === undefined ? {} : { placement }),
      maxWidth: maxWidth === undefined ? 48 : Math.floor(maxWidth),
      border: prepareTooltipBorder(value.border),
    };
  },
  layer: ({ model }) => ({
    visible: model.presentation.kind === 'visible',
    zIndex: 20,
    underlay: 'clear',
  }),
  compose({ model, styles, layer }) {
    const content = text({
      content: model.lines.join('\n'),
      ...(styles?.parts?.content === undefined
        ? {}
        : { meta: { styles: { root: styles.parts.content } } }),
    });
    const panel = surface(content, {
      ...(model.title.length === 0 ? {} : { title: model.title }),
      border: model.border,
      maxWidth: model.maxWidth,
      meta: {
        styles: {
          root: tooltipBackgroundStyle(model.tone, styles?.parts?.background),
          parts: {
            border: tooltipBorderStyle(model.tone, styles?.parts?.border),
            ...(styles?.parts?.title === undefined ? {} : { title: styles.parts.title }),
          },
        },
      },
    });
    return portal(
      panel,
      model.presentation.kind === 'visible'
        ? {
          anchor: model.presentation.anchor,
          ...(model.placement === undefined ? {} : { placement: model.placement }),
          ...(layer === undefined ? {} : { meta: { layer } }),
        }
        : {
          anchor: { kind: 'allocation' },
          placement: 'center',
          ...(layer === undefined ? {} : { meta: { layer } }),
        },
    );
  },
  accessibility({ id, model }) {
    const content = model.lines.join(' ');
    return {
      id,
      role: 'tooltip',
      label: model.title.length === 0 ? content || id : model.title,
      ...(content.length === 0 || content === model.title ? {} : { description: content }),
      live: 'polite',
      scope: { kind: 'popover' },
    };
  },
});

function prepareTooltipPresentation(value: unknown): TooltipPresentation {
  if (!isNonArrayObject(value) || (value['kind'] !== 'hidden' && value['kind'] !== 'visible')) {
    throw new TypeError('tooltip presentation must be hidden or visible.');
  }
  if (value['kind'] === 'hidden') {
    if (value['anchor'] !== undefined) {
      throw new TypeError('hidden tooltip presentation cannot define an anchor.');
    }
    return { kind: 'hidden' };
  }
  const anchor = value['anchor'];
  if (!isNonArrayObject(anchor) || !isTooltipAnchor(anchor)) {
    throw new TypeError('visible tooltip presentation requires a valid anchor.');
  }
  return { kind: 'visible', anchor };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isTooltipAnchor(
  value: Readonly<Record<string, unknown>>,
): value is Extract<TooltipPresentation, { readonly kind: 'visible' }>['anchor'] {
  if (value['kind'] === 'target') return isFiniteRect(value['bounds']);
  if (value['kind'] === 'cursor') {
    return typeof value['row'] === 'number' &&
      Number.isFinite(value['row']) &&
      typeof value['column'] === 'number' &&
      Number.isFinite(value['column']);
  }
  return false;
}

function isFiniteRect(value: unknown): value is import('../../geometry/types.ts').Rect {
  return isNonArrayObject(value) &&
    ['row', 'column', 'width', 'height'].every((field) =>
      typeof value[field] === 'number' && Number.isFinite(value[field])
    );
}

function prepareTooltipBorder(value: unknown): BorderOptions {
  if (value === undefined) return { kind: 'rounded' };
  if (!isNonArrayObject(value) || !isBorderKind(value['kind'])) {
    throw new TypeError('tooltip border is invalid.');
  }
  const titleAlign = value['titleAlign'];
  if (
    titleAlign !== undefined && titleAlign !== 'start' && titleAlign !== 'center' &&
    titleAlign !== 'end'
  ) {
    throw new TypeError('tooltip border titleAlign is invalid.');
  }
  return { kind: value['kind'], ...(titleAlign === undefined ? {} : { titleAlign }) };
}

function isTooltipTone(value: unknown): value is TooltipTone {
  return value === 'default' || value === 'info' || value === 'success' || value === 'warning' ||
    value === 'error';
}

function isAnchoredPlacement(value: unknown): value is AnchoredSurfacePlacement {
  return value === 'above' || value === 'below' || value === 'left' ||
    value === 'right' || value === 'auto' || value === 'cursor';
}

function isBorderKind(value: unknown): value is BorderOptions['kind'] {
  return value === 'none' || value === 'single' || value === 'double' || value === 'rounded' ||
    value === 'heavy' || value === 'ascii' || value === 'dashed' || value === 'dotted' ||
    value === 'empty';
}

function tooltipBackgroundStyle(
  tone: TooltipTone,
  override: import('../../visual/render.ts').TerminalStyle | undefined,
) {
  return {
    bg: {
      kind: 'theme' as const,
      token: tone === 'warning'
        ? 'surface.warning.background' as const
        : tone === 'error'
        ? 'surface.danger.background' as const
        : tone === 'success'
        ? 'surface.success.background' as const
        : tone === 'info'
        ? 'surface.selected.background' as const
        : 'surface.raised.background' as const,
    },
    ...override,
  };
}

function tooltipBorderStyle(
  tone: TooltipTone,
  override: import('../../visual/render.ts').TerminalStyle | undefined,
) {
  return {
    fg: {
      kind: 'theme' as const,
      token: tone === 'warning'
        ? 'surface.warning.border' as const
        : tone === 'error'
        ? 'surface.danger.border' as const
        : tone === 'success'
        ? 'surface.success.border' as const
        : tone === 'info'
        ? 'surface.selected.border' as const
        : 'surface.raised.border' as const,
    },
    ...override,
  };
}
