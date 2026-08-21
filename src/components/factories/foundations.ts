import {
  defineComponent,
  ignoreMessage,
  span,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import { assertOptionalEnum, assertRequiredCallback } from '../../foundation/validation.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
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
}

interface LinkComponentAction {
  readonly kind: 'activate';
  readonly event: LinkActivateEvent;
}

const instantiateLink = defineComponent<
  LinkModel,
  LinkModel,
  LinkComponentAction,
  LinkStylePart,
  readonly ['disabled', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'disabled', 'busy']
>({
  name: 'terminal-ui/components/link',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'link',
  states: ['disabled', 'busy', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['label'],
  visualStates: ['focused', 'hovered', 'pressed', 'disabled', 'busy'],
  measure: ({ model, widthProfile }) => ({
    minWidth: 0,
    minHeight: 0,
    preferredWidth: measureTextCells(model.label, { widthProfile }).cells,
    preferredHeight: 1,
  }),
  render(input) {
    const state = input.disabled
      ? 'disabled'
      : pointerVisualState(input.pointerState, `${input.id ?? 'link'}:link`);
    const style = input.style({
      part: 'label',
      base: { fg: { kind: 'theme', token: 'link.foreground' }, underline: true },
      ...(state === undefined ? {} : { states: [state] }),
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
  const model = {
    label,
    accessibleName,
    href,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateLink({
    ...model,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateLink({ ...model, inert: true });
  assertRequiredCallback(options.onActivate, 'link onActivate');
  return instantiateLink({
    ...model,
    onAction: (action) => options.onActivate(action.event),
  });
}

export function toggleButton<const TMessage extends ComponentMessage = never>(
  options: ToggleButtonOptions<TMessage>,
): Element<TMessage> {
  const model = {
    ...(options.label === undefined ? {} : { label: options.label }),
    accessibleName: options.accessibleName ?? options.label ?? '',
    ...(options.leading === undefined ? {} : { leading: options.leading }),
    ...(options.trailing === undefined ? {} : { trailing: options.trailing }),
    ...(options.tone === undefined ? {} : { tone: options.tone }),
    ...(options.density === undefined ? {} : { density: options.density }),
    pressed: options.pressed,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateToggleButton({
    ...model,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return instantiateToggleButton({ ...model, inert: true });
  assertRequiredCallback(options.onTransition, 'toggleButton onTransition');
  return instantiateToggleButton({
    ...model,
    onAction: () => options.onTransition({ kind: 'setPressed', pressed: !options.pressed }),
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
