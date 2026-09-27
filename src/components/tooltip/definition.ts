import type { AccessibleNode } from '../../accessibility/types.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element, ElementMessage } from '../../element/types.ts';
import { assertOptionalEnum, assertRequiredCallback } from '../../foundation/validation.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { overlay, portal, surface } from '../../layout/factories/surfaces.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import type { BorderOptions } from '../../visual/border.ts';
import { text } from '../text-content/definition.ts';
import type { TooltipTone, TooltipTransition } from './contracts.ts';
import type { TooltipOptions } from './options.ts';


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

const instantiateTooltip = defineComponent<Pick<
    TooltipOptions<Element, ComponentMessage>,
    'content' | 'open' | 'title' | 'tone' | 'placement' | 'maxWidth' | 'border'
  >, TooltipTransition>()({
  name: 'terminal-ui/components/tooltip',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots: tooltipSlots,
  metadata: ['styles'],
  parts: ['background', 'border', 'title', 'content'],
  createModel(value): TooltipModel {
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
      border: decodeTooltipBorder(value.border),
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
  hitTargets: ({ id, bounds }) => [{
    id: `${id ?? 'tooltip'}:trigger`,
    bounds,
    accepts: ['enter', 'leave'],
    message: (event) => event.kind === 'enter'
      ? { kind: 'setOpen', open: true, reason: 'pointer' }
      : event.kind === 'leave'
        ? { kind: 'setOpen', open: false, reason: 'pointer' }
        : ignoreMessage(),
  }],
  compose({ id, model, slots, styles, layer }) {
    if (!model.open) return slots.trigger;
    const content = text({
      content: model.lines.join('\n'),
      ...(styles?.parts?.content === undefined
        ? {}
        : { styles: { root: styles.parts.content } }),
    });
    const panel = surface(content, {
      ...(model.title.length === 0 ? {} : { title: model.title }),
      border: model.border,
      maxWidth: model.maxWidth,
      styles: {
        root: tooltipBackgroundStyle(model.tone, styles?.parts?.background),
        parts: {
          border: tooltipBorderStyle(model.tone, styles?.parts?.border),
          ...(styles?.parts?.title === undefined ? {} : { title: styles.parts.title }),
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

function decodeTooltipBorder(value: TooltipOptions<Element>['border']): BorderOptions {
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
  override: import('../../visual/render-content.ts').TerminalStyle | undefined,
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
  override: import('../../visual/render-content.ts').TerminalStyle | undefined,
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
