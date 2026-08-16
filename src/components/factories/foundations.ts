import {
  defineComponent,
  ignoreMessage,
  span,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import { assertOptionalCallback, assertOptionalEnum, assertRequiredCallback } from '../../foundation/validation.ts';
import { pointerVisualState, preparePointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionAction, PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { LinkActivateEvent } from '../../ui-model/foundations.ts';
import type { ElementKeyEvent } from '../../element/metadata.ts';
import type { RoutedPointerEvent } from '../../input/index.ts';
import type { LinkStylePart } from '../../ui-model/style-parts.ts';
import type { LinkOptions, ToggleButtonOptions, ToolbarOptions } from '../options/foundations.ts';
import { instantiateToggleButton } from './forms.ts';

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
    triggers: [{
      trigger: { kind: 'key', key: 'enter', modifiers: { kind: 'any' } },
      onKey: (event) => ({ kind: 'activate', event: keyboardLinkActivation(model.href, event) }),
    }],
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: ({ id, model, bounds, busy }) => busy ? [] : [{
    id: `${id ?? 'link'}:link`,
    bounds,
    accepts: ['click', 'contextMenu', 'pointerDown'],
    cursor: 'pointer',
    message: (event) => event.kind === 'pointerDown' && event.button !== 'middle'
      ? ignoreMessage()
      : ({ kind: 'activate', event: pointerLinkActivation(model.href, event) }),
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

export function toggleButton<const TMessage extends ComponentMessage = never>(
  options: ToggleButtonOptions<TMessage>,
): Element<TMessage> {
  const pointerState = preparePointerInteractionState(
    options.pointerState,
    'toggleButton pointerState',
    options.disabled !== true && options.inert !== true,
  );
  const model = {
    ...(options.label === undefined ? {} : { label: options.label }),
    accessibleName: options.accessibleName ?? options.label ?? '',
    ...(options.leading === undefined ? {} : { leading: options.leading }),
    ...(options.trailing === undefined ? {} : { trailing: options.trailing }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    ...(options.density === undefined ? {} : { density: options.density }),
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
    onAction: (action) => action.kind === 'pointerLifecycle'
      ? options.onPointerAction?.(action.action) ?? ignoreMessage()
      : options.onTransition({ kind: 'setPressed', pressed: !options.pressed }),
  });
}

interface ToolbarModel {
  readonly label: string;
  readonly orientation: 'horizontal' | 'vertical';
}

const toolbarSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
} as const;

const instantiateToolbar = defineComponent<
  ToolbarModel,
  ToolbarModel,
  never,
  never,
  readonly [],
  'required',
  readonly ['focus', 'layer'],
  typeof toolbarSlots
>({
  name: 'terminal-ui/components/toolbar',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'toolbar',
  slots: toolbarSlots,
  metadata: ['focus', 'layer'],
  measure(input) {
    const content = input.slots.measure('content');
    return content;
  },
  layout(input) {
    return { content: { row: 0, column: 0, width: input.bounds.width, height: input.bounds.height } };
  },
  focusNavigation: ({ model }) => ({ orientation: model.orientation }),
  focusTargets: () => [],
  accessibility: ({ id, model, slots }) => ({
    id,
    role: 'toolbar',
    label: model.label,
    orientation: model.orientation,
    children: slots.content,
  }),
});

export function toolbar<const TContent extends Element<ComponentMessage>>(
  content: TContent,
  options: ToolbarOptions,
): Element<ElementMessage<TContent>> {
  assertOptionalEnum(options.orientation, ['horizontal', 'vertical'], 'toolbar orientation');
  return instantiateToolbar({
    id: options.id,
    label: clean(options.label, 'toolbar label'),
    orientation: options.orientation ?? 'horizontal',
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    slots: { content },
  });
}

function clean(value: unknown, owner: string): string {
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  const result = sanitizeTerminalText(value).text.trim();
  if (result.length === 0) throw new TypeError(`${owner} must not be empty.`);
  return result;
}

function keyboardLinkActivation(href: string, event: ElementKeyEvent): LinkActivateEvent {
  if (event.input.kind !== 'key') {
    throw new TypeError('link keyboard activation requires a key event.');
  }
  return { kind: 'activate', href, trigger: { kind: 'keyboard', modifiers: event.input.modifiers } };
}

function pointerLinkActivation(href: string, event: RoutedPointerEvent): LinkActivateEvent {
  return {
    kind: 'activate',
    href,
    trigger: { kind: 'pointer', button: event.button, modifiers: event.modifiers },
  };
}
