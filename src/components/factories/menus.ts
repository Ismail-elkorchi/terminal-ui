import { defineComponent, ignoreMessage } from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { ElementMessage } from '../../element/index.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
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
import { assertOptionalEnum, assertRequiredCallback } from '../../foundation/validation.ts';
import { overlay, portal, surface } from '../../layout/index.ts';
import { text } from './content.ts';
import type { TooltipTone, TooltipTransition } from '../../ui-model/menu.ts';
import type { TooltipStylePart } from '../../ui-model/style-parts.ts';
import type { BorderOptions } from '../../visual/border.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';

interface PreparedDivider {
  readonly orientation: DividerOrientation;
  readonly line: DividerLineKind;
  readonly label: string;
  readonly labelAlign: 'start' | 'center' | 'end';
}

const dividerDefinitionBase = {
  identity: 'optional' as const,
  structure: 'leaf' as const,
  metadata: ['styles', 'layer'] as const,
  parts: ['line', 'label'] as const,
  prepare: prepareDivider,
  measure: measureDivider,
  render: renderDivider,
};

const labelledDivider = defineComponent<
  Omit<DividerOptions, 'id' | 'meta'>,
  PreparedDivider,
  never,
  DividerStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  ...dividerDefinitionBase,
  name: 'terminal-ui/components/divider',
  semantics: 'semantic',
  accessibleRole: 'separator',
  accessibility: ({ id, model }) => ({
    id,
    role: 'separator',
    label: model.label,
    orientation: model.orientation,
  }),
});

const decorativeDivider = defineComponent<
  Omit<DividerOptions, 'id' | 'meta'>,
  PreparedDivider,
  DividerStylePart,
  'optional',
  readonly ['styles', 'layer']
>({
  ...dividerDefinitionBase,
  name: 'terminal-ui/components/divider-decoration',
  semantics: 'decorative',
});

export function divider(options: DividerOptions): Element {
  return options.label === undefined || sanitizeTerminalText(options.label).text.trim().length === 0
    ? decorativeDivider(options)
    : labelledDivider(options);
}

function prepareDivider(value: Readonly<Omit<DividerOptions, 'id' | 'meta'>>): PreparedDivider {
    const orientation = value.orientation;
    const line = value.line;
    const label = value.label;
    const labelAlign = value.labelAlign;
    assertOptionalEnum(orientation, ['horizontal', 'vertical'], 'divider orientation');
    if (line !== undefined && !isDividerLineKind(line)) {
      throw new TypeError('divider line is invalid.');
    }
    if (label !== undefined && typeof label !== 'string') {
      throw new TypeError('divider label must be a string.');
    }
    assertOptionalEnum(labelAlign, ['start', 'center', 'end'], 'divider labelAlign');
    return {
      orientation: orientation ?? 'horizontal',
      line: line ?? 'single',
      label: label === undefined ? '' : sanitizeTerminalText(label).text,
      labelAlign: labelAlign ?? 'start',
    };
}

function measureDivider({ model, widthProfile }: {
  readonly model: PreparedDivider;
  readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
}) {
    const labelCells = measureTextCells(model.label, { widthProfile }).cells;
    return model.orientation === 'vertical'
      ? { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: Math.max(1, labelCells) }
      : {
        minWidth: 1,
        minHeight: 1,
        preferredWidth: Math.max(1, labelCells + (labelCells === 0 ? 0 : 2)),
        preferredHeight: 1,
      };
}

function renderDivider({ model, bounds, target, theme, style, source, widthProfile }:
  import('../../component/index.ts').ComponentRenderInput<PreparedDivider, DividerStylePart>
): void {
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
}

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
  readonly open: boolean;
  readonly title: string;
  readonly tone: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth: number;
  readonly border: BorderOptions;
}

const tooltipSlots = {
  trigger: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
} as const;

const instantiateTooltip = defineComponent<
  Pick<
    TooltipOptions<Element, ComponentMessage>,
    'content' | 'open' | 'title' | 'tone' | 'placement' | 'maxWidth' | 'border'
  >,
  TooltipModel,
  TooltipTransition,
  TooltipStylePart,
  readonly [],
  'required',
  readonly ['styles'],
  typeof tooltipSlots
>({
  name: 'terminal-ui/components/tooltip',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots: tooltipSlots,
  metadata: ['styles'],
  parts: ['background', 'border', 'title', 'content'],
  prepare(value) {
    const content = value.content;
    const open = value.open;
    const title = value.title;
    const tone = value.tone;
    const placement = value.placement;
    const maxWidth = value.maxWidth;
    if (typeof content !== 'string' && !isStringArray(content)) {
      throw new TypeError('tooltip content must be a string or an array of strings.');
    }
    if (typeof open !== 'boolean') throw new TypeError('tooltip open must be a boolean.');
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
      open,
      title: title === undefined ? '' : sanitizeTerminalText(title).text,
      tone: tone ?? 'default',
      ...(placement === undefined ? {} : { placement }),
      maxWidth: maxWidth === undefined ? 48 : Math.floor(maxWidth),
      border: prepareTooltipBorder(value.border),
    };
  },
  layer: ({ model }) => ({
    visible: model.open,
    zIndex: 20,
    underlay: 'clear',
  }),
  keys: ({ model }) => model.open
    ? { escape: () => ({ kind: 'setOpen', open: false, reason: 'escape' }) }
    : {},
  onFocus: (event) => ({
    kind: 'setOpen',
    open: event.kind === 'focusEnter',
    reason: 'focus',
  }),
  pointer: {
    onAction: (action) => action.kind === 'enter'
      ? { kind: 'setOpen', open: true, reason: 'pointer' }
      : action.kind === 'leave'
      ? { kind: 'setOpen', open: false, reason: 'pointer' }
      : ignoreMessage(),
  },
  hitTargets: ({ id, bounds }) => [{
    id: `${id ?? 'tooltip'}:trigger`,
    bounds,
    accepts: ['click'],
    message: () => ignoreMessage(),
  }],
  compose({ id, model, slots, styles, layer }) {
    if (!model.open) return slots.trigger;
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
    return overlay([
      slots.trigger,
      portal(panel, {
        id: `${id ?? 'tooltip'}:popup`,
        anchor: { kind: 'allocation' },
        placement: model.placement ?? 'above',
        ...(layer === undefined ? {} : { meta: { layer } }),
      }),
    ]);
  },
  accessibility({ id, model, slots, focused }) {
    const content = model.lines.join(' ');
    const tooltipId = `${id}:tooltip`;
    const triggerNode = slots.trigger[0];
    if (triggerNode === undefined) {
      throw new Error('tooltip accessibility requires its trigger slot.');
    }
    const trigger: AccessibleNode = model.open
      ? { ...triggerNode, describedBy: [...(triggerNode.describedBy ?? []), tooltipId] }
      : triggerNode;
    return {
      id,
      role: 'group',
      label: 'Tooltip owner',
      ...(focused ? { focused: true } : {}),
      children: [
        trigger,
        ...(model.open ? [{
          id: tooltipId,
          role: 'tooltip' as const,
          label: model.title.length === 0 ? content : model.title,
          ...(content.length === 0 || content === model.title ? {} : { description: content }),
          live: 'polite' as const,
          scope: { kind: 'popover' as const },
        }] : []),
      ],
    };
  },
});

export function tooltip<
  const TTrigger extends Element<ComponentMessage>,
  const TMessage extends ComponentMessage = never,
>(options: TooltipOptions<TTrigger, TMessage>): Element<ElementMessage<TTrigger> | TMessage> {
  assertRequiredCallback(options.onTransition, 'tooltip onTransition');
  return instantiateTooltip({
    id: options.id,
    content: options.content,
    open: options.open,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.border === undefined ? {} : { border: options.border }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    slots: { trigger: options.trigger },
    onAction: options.onTransition,
  });
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function prepareTooltipBorder(value: TooltipOptions<Element>['border']): BorderOptions {
  if (value === undefined) return { kind: 'rounded' };
  if (!isBorderKind(value.kind)) {
    throw new TypeError('tooltip border is invalid.');
  }
  const titleAlign = value.titleAlign;
  assertOptionalEnum(titleAlign, ['start', 'center', 'end'], 'tooltip border titleAlign');
  return { kind: value.kind, ...(titleAlign === undefined ? {} : { titleAlign }) };
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
