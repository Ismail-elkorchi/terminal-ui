import {
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  span,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import type { Rect } from '../../geometry/types.ts';
import { assertOptionalCallback, assertRequiredCallback } from '../../foundation/validation.ts';
import { pointerVisualState, preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionAction, PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { LinkActivateEvent, ToggleButtonTransition } from '../../ui-model/foundations.ts';
import type { LinkStylePart, ToggleButtonStylePart, ToolbarStylePart } from '../../ui-model/style-parts.ts';
import type { LinkOptions, ToggleButtonOptions, ToolbarOptions } from '../options/foundations.ts';

interface LinkModel {
  readonly label: string;
  readonly accessibleName: string;
  readonly href: string;
  readonly pointerState?: PointerInteractionState;
}

type LinkComponentAction =
  | { readonly kind: 'activate'; readonly event: LinkActivateEvent }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

const instantiateLink = defineComponent<
  LinkModel,
  LinkModel,
  LinkComponentAction,
  LinkStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/link',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'link',
  states: ['disabled', 'busy', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label'],
  measure: ({ model, widthProfile }) => ({
    minWidth: 0,
    minHeight: 0,
    preferredWidth: measureTextCells(model.label, { widthProfile }).cells,
    preferredHeight: 1,
  }),
  render(input) {
    const state = input.disabled
      ? 'disabled'
      : pointerVisualState(input.model.pointerState, `${input.id ?? 'link'}:link`);
    const style = input.style({
      part: 'label',
      base: { fg: { kind: 'theme', token: 'link.foreground' }, underline: true },
      ...(state === undefined ? {} : { state }),
    });
    input.target.write(0, 0, [span(input.model.label, {
      ...(style === undefined ? {} : { style }),
      link: { href: input.model.href },
      source: input.source({ partName: 'label', partType: 'link', cellRole: 'text' }),
    })]);
  },
  keys: ({ model, busy }) => busy ? {} : {
    enter: () => ({ kind: 'activate', event: { kind: 'activate', href: model.href } }),
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds, busy }) => busy ? [] : [{
    id: `${id ?? 'link'}:link`,
    bounds,
    accepts: ['click'],
    cursor: 'pointer',
    message: () => ({ kind: 'activate', event: { kind: 'activate', href: model.href } }),
  }],
  accessibility: ({ id, model, focused }) => ({
    id,
    role: 'link',
    label: model.accessibleName,
    value: model.href,
    ...(focused ? { focused: true } : {}),
  }),
});

export function link<const TMessage extends ComponentMessage = never>(
  options: LinkOptions<TMessage>,
): Element<TMessage> {
  const label = clean(options.label, 'link label');
  const accessibleName = clean(options.accessibleName ?? options.label, 'link accessibleName');
  const href = clean(options.href, 'link href');
  const pointerState = preparePointerInteractionState(
    options.pointerState,
    'link pointerState',
    options.disabled !== true && options.inert !== true,
  );
  const model = {
    label,
    accessibleName,
    href,
    ...(pointerState === undefined ? {} : { pointerState }),
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateLink({
    ...model,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateLink({ ...model, inert: true });
  assertRequiredCallback(options.onActivate, 'link onActivate');
  assertOptionalCallback(options.onPointerAction, 'link onPointerAction');
  return instantiateLink({
    ...model,
    onAction: (action) => action.kind === 'activate'
      ? options.onActivate(action.event)
      : options.onPointerAction?.(action.action) ?? ignoreMessage(),
  });
}

interface ToggleButtonModel {
  readonly label: string;
  readonly accessibleName: string;
  readonly pressed: boolean;
  readonly pointerState?: PointerInteractionState;
}

type ToggleButtonComponentAction =
  | { readonly kind: 'transition'; readonly action: ToggleButtonTransition }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

const instantiateToggleButton = defineComponent<
  ToggleButtonModel,
  ToggleButtonModel,
  ToggleButtonComponentAction,
  ToggleButtonStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/toggle-button',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'button',
  states: ['disabled', 'busy', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label', 'indicator'],
  measure: ({ model, widthProfile }) => ({
    minWidth: 0,
    minHeight: 0,
    preferredWidth: measureRenderSpans([span(`[${model.pressed ? 'x' : ' '}] ${model.label}`)], { widthProfile }),
    preferredHeight: 1,
  }),
  render(input) {
    const state = input.disabled ? 'disabled' : pointerVisualState(
      input.model.pointerState,
      `${input.id ?? 'toggle-button'}:button`,
    )
      ?? (input.model.pressed ? 'selected' : undefined);
    const indicatorStyle = input.style({ part: 'indicator', ...(state === undefined ? {} : { state }) });
    const labelStyle = input.style({ part: 'label', ...(state === undefined ? {} : { state }) });
    input.target.write(0, 0, [
      span(`[${input.model.pressed ? 'x' : ' '}]`, {
        ...(indicatorStyle === undefined ? {} : { style: indicatorStyle }),
        source: input.source({ partName: 'indicator' }),
      }),
      span(` ${input.model.label}`, {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: input.source({ partName: 'label' }),
      }),
    ]);
  },
  keys: ({ model, busy }) => busy ? {} : {
    enter: () => toggleAction(model),
    space: () => toggleAction(model),
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds, busy }) => busy ? [] : [{
    id: `${id ?? 'toggle-button'}:button`,
    bounds,
    accepts: ['click'],
    cursor: 'pointer',
    message: () => toggleAction(model),
  }],
  accessibility: ({ id, model, focused }) => ({
    id,
    role: 'button',
    label: model.accessibleName,
    pressed: model.pressed,
    ...(focused ? { focused: true } : {}),
  }),
});

export function toggleButton<const TMessage extends ComponentMessage = never>(
  options: ToggleButtonOptions<TMessage>,
): Element<TMessage> {
  const pointerState = preparePointerInteractionState(
    options.pointerState,
    'toggleButton pointerState',
    options.disabled !== true && options.inert !== true,
  );
  const model = {
    label: clean(options.label, 'toggleButton label'),
    accessibleName: clean(options.accessibleName ?? options.label, 'toggleButton accessibleName'),
    pressed: options.pressed,
    ...(pointerState === undefined ? {} : { pointerState }),
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateToggleButton({
    ...model,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateToggleButton({ ...model, inert: true });
  assertRequiredCallback(options.onTransition, 'toggleButton onTransition');
  assertOptionalCallback(options.onPointerAction, 'toggleButton onPointerAction');
  return instantiateToggleButton({
    ...model,
    onAction: (action) => action.kind === 'transition'
      ? options.onTransition(action.action)
      : options.onPointerAction?.(action.action) ?? ignoreMessage(),
  });
}

interface ToolbarModel {
  readonly label: string;
  readonly orientation: 'horizontal' | 'vertical';
}

const toolbarSlots = {
  items: { cardinality: 'many', owner: 'caller', messages: 'bubble' },
} as const;

const instantiateToolbar = defineComponent<
  ToolbarModel,
  ToolbarModel,
  never,
  ToolbarStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof toolbarSlots
>({
  name: 'terminal-ui/components/toolbar',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'toolbar',
  slots: toolbarSlots,
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label'],
  measure(input) {
    const items = Array.from({ length: input.slots.count('items') }, (_unused, index) => input.slots.measure('items', index));
    return input.model.orientation === 'horizontal'
      ? {
        minWidth: 0,
        minHeight: 0,
        preferredWidth: items.reduce((sum, item) => sum + item.preferredWidth, 0) + Math.max(0, items.length - 1),
        preferredHeight: Math.max(0, ...items.map((item) => item.preferredHeight)),
      }
      : {
        minWidth: 0,
        minHeight: 0,
        preferredWidth: Math.max(0, ...items.map((item) => item.preferredWidth)),
        preferredHeight: items.reduce((sum, item) => sum + item.preferredHeight, 0),
      };
  },
  layout(input) {
    let offset = 0;
    const items = Array.from({ length: input.slots.count('items') }, (_unused, index): Rect => {
      const measured = input.slots.measure('items', index);
      const rect = input.model.orientation === 'horizontal'
        ? { row: 0, column: offset, width: measured.preferredWidth, height: input.bounds.height }
        : { row: offset, column: 0, width: input.bounds.width, height: measured.preferredHeight };
      offset += (input.model.orientation === 'horizontal' ? rect.width : rect.height) + 1;
      return rect;
    });
    return { items };
  },
  focusTargets: () => [],
  accessibility: ({ id, model, slots }) => ({
    id,
    role: 'toolbar',
    label: model.label,
    orientation: model.orientation,
    children: slots.items,
  }),
});

export function toolbar<const TItems extends readonly Element[]>(
  options: ToolbarOptions<TItems>,
): Element<ElementMessage<TItems[number]>> {
  return instantiateToolbar({
    id: options.id,
    label: clean(options.label, 'toolbar label'),
    orientation: options.orientation ?? 'horizontal',
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    slots: { items: options.items },
  }) as Element<ElementMessage<TItems[number]>>;
}

function clean(value: unknown, owner: string): string {
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  const result = sanitizeTerminalText(value).text.trim();
  if (result.length === 0) throw new TypeError(`${owner} must not be empty.`);
  return result;
}

function toggleAction(model: ToggleButtonModel): ToggleButtonComponentAction {
  return { kind: 'transition', action: { kind: 'setPressed', pressed: !model.pressed } };
}
