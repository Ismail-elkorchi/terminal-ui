import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../../element/index.ts';
import type {
  ButtonOptions,
  CheckboxGroupOptions,
  CheckboxOptions,
  ColorSwatchPickerOptions,
  CalendarOptions,
  FieldOptions,
  FormOptions,
  LabelOptions,
  NumberInputOptions,
  RadioGroupOptions,
  RangeSliderOptions,
  SelectOptions,
  SliderOptions,
  TextInputOptions,
  ToggleSwitchOptions
} from '../options/forms.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import {
  activationKeyBindings,
  checkboxGroupKeyBindings,
  colorSwatchPickerKeyBindings,
  componentMetaProps,
  calendarKeyBindings,
  interactionProps,
  numberInputKeyBindings,
  radioGroupKeyBindings,
  rangeSliderKeyBindings,
  sliderKeyBindings,
  selectKeyBindings,
  textEditInputHandlers,
  textInputKeyBindings
} from '../internal/interaction.ts';
import {
  layoutProps,
  optionalId,
  requiredId,
  renderNodeChildren
} from '../../authoring/render-node.ts';
import { choiceItemsForRenderer, colorOptionsForRenderer } from '../internal/domain.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';

export function form<const TChildren extends ElementChildren>(
  children: TChildren,
  options: FormOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return elementFromRenderNode<'form', Message>({
    ...optionalId(options.id),
    kind: 'form',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...layoutProps(options)
    },
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  });
}

export function field<const TChildren extends ElementChildren>(
  children: TChildren,
  options: FieldOptions
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return elementFromRenderNode<'field', Message>({
    ...optionalId(options.id),
    kind: 'field',
    props: {
      label: options.label,
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...layoutProps(options)
    },
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  });
}

export function label(options: LabelOptions): Element {
  return elementFromRenderNode<'label'>({
    ...optionalId(options.id),
    kind: 'label',
    props: {
      text: options.text,
      ...(options.forId === undefined ? {} : { forId: options.forId }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled })
    },
    ...componentMetaProps(options.meta)
  });
}

export function button<
  const TPressMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  ButtonOptions,
  Record<never, never>,
  { readonly onPress: TPressMessage },
  TKeys,
  TPointerMessage
>): Element<TPressMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function button(options: ButtonOptions<unknown>): Element<unknown> {
  const state = options.state ?? 'idle';
  const keyMap = activationKeyBindings(
    options.onPress === undefined || options.disabled === true || state === 'pending' ? undefined : () => options.onPress,
    options.keys
  );
  return elementFromRenderNode<'button', unknown>({
    ...requiredId(options.id, 'button'),
    kind: 'button',
    props: {
      label: options.label,
      ...(options.leading === undefined ? {} : { leading: normalizeInlineContent(options.leading) }),
      ...(options.trailing === undefined ? {} : { trailing: normalizeInlineContent(options.trailing) }),
      ...(options.onPress === undefined ? {} : { message: options.onPress }),
      state,
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.tone === undefined ? {} : { tone: options.tone })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function checkbox<const TMessage = never>(options: CheckboxOptions<TMessage>): Element<TMessage> {
  const toMessage = options.onChange;
  const keyMap = activationKeyBindings(
    toMessage === undefined ? undefined : () => toMessage(!options.checked),
    options.keys
  );
  return elementFromRenderNode<'checkbox', TMessage>({
    ...requiredId(options.id, 'checkbox'),
    kind: 'checkbox',
    props: {
      label: options.label,
      checked: options.checked,
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function toggleSwitch<const TMessage = never>(options: ToggleSwitchOptions<TMessage>): Element<TMessage> {
  const toMessage = options.onChange;
  const keyMap = activationKeyBindings(
    toMessage === undefined ? undefined : () => toMessage(!options.checked),
    options.keys
  );
  return elementFromRenderNode<'toggleSwitch', TMessage>({
    ...requiredId(options.id, 'toggleSwitch'),
    kind: 'toggleSwitch',
    props: {
      label: options.label,
      checked: options.checked,
      ...(options.onLabel === undefined ? {} : { onLabel: options.onLabel }),
      ...(options.offLabel === undefined ? {} : { offLabel: options.offLabel }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function slider<const TMessage = never>(options: SliderOptions<TMessage>): Element<TMessage> {
  const keyMap = sliderKeyBindings(options);
  return elementFromRenderNode<'slider', TMessage>({
    ...requiredId(options.id, 'slider'),
    kind: 'slider',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      value: options.value,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function rangeSlider<const TMessage = never>(options: RangeSliderOptions<TMessage>): Element<TMessage> {
  assertRangeSliderOptions(options);
  const keyMap = rangeSliderKeyBindings(options);
  return elementFromRenderNode<'rangeSlider', TMessage>({
    ...requiredId(options.id, 'rangeSlider'),
    kind: 'rangeSlider',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      value: options.value,
      ...(options.range === undefined ? {} : { range: options.range }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function checkboxGroup<TValue, const TMessage = never>(options: CheckboxGroupOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = checkboxGroupKeyBindings(options);
  return elementFromRenderNode<'checkboxGroup', TMessage>({
    ...requiredId(options.id, 'checkboxGroup'),
    kind: 'checkboxGroup',
    props: {
      options: choiceItemsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.focused === undefined ? {} : { focused: options.focused }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function radioGroup<TValue, const TMessage = never>(options: RadioGroupOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = radioGroupKeyBindings(options);
  return elementFromRenderNode<'radioGroup', TMessage>({
    ...requiredId(options.id, 'radioGroup'),
    kind: 'radioGroup',
    props: {
      options: choiceItemsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.focused === undefined ? {} : { focused: options.focused }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function colorSwatchPicker<TValue, const TMessage = never>(options: ColorSwatchPickerOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = colorSwatchPickerKeyBindings(options);
  return elementFromRenderNode<'colorSwatchPicker', TMessage>({
    ...requiredId(options.id, 'colorSwatchPicker'),
    kind: 'colorSwatchPicker',
    props: {
      options: colorOptionsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.focused === undefined ? {} : { focused: options.focused }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function calendar<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  CalendarOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function calendar(options: CalendarOptions<unknown>): Element<unknown> {
  const keyMap = calendarKeyBindings(options);
  const onAction = options.onAction;
  return elementFromRenderNode<'calendar', unknown>({
    ...requiredId(options.id, 'calendar'),
    kind: 'calendar',
    props: {
      days: options.days,
      monthLabel: options.monthLabel,
      weekdays: options.weekdays,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.focused === undefined ? {} : { focused: options.focused }),
      ...(onAction === undefined ? {} : {
        toMessage: (day) => onAction({ kind: 'select', date: day.date }),
        toActionMessage: onAction
      }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function select<TValue, const TMessage = never>(options: SelectOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = selectKeyBindings(options);
  return elementFromRenderNode<'select', TMessage>({
    ...requiredId(options.id, 'select'),
    kind: 'select',
    props: {
      options: choiceItemsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.focused === undefined ? {} : { focused: options.focused }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function textInput<
  const TSubmitMessage = never,
  const TTextPointerMessage = never,
  const TEditMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  TextInputOptions,
  {
    readonly onTextPointer: TTextPointerMessage;
    readonly onEdit: TEditMessage;
  },
  { readonly onSubmit: TSubmitMessage },
  TKeys,
  TPointerMessage
>): Element<TSubmitMessage | TTextPointerMessage | TEditMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function textInput(options: TextInputOptions<unknown>): Element<unknown> {
  const keyMap = textInputKeyBindings(options.onEdit, options.onSubmit, options.keys);
  return elementFromRenderNode<'textInput', unknown>({
    ...requiredId(options.id, 'textInput'),
    kind: 'textInput',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onSubmit === undefined ? {} : { message: options.onSubmit }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({
      ...textEditInputHandlers(options.onEdit),
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

export function numberInput<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  NumberInputOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function numberInput(options: NumberInputOptions<unknown>): Element<unknown> {
  const keyMap = numberInputKeyBindings(options.onAction, options.keys);
  const editHandlers = textEditInputHandlers(
    options.onAction === undefined
      ? undefined
      : (operation) => options.onAction?.({ kind: 'edit', operation })
  );
  return elementFromRenderNode<'numberInput', unknown>({
    ...requiredId(options.id, 'numberInput'),
    kind: 'numberInput',
    props: {
      presentation: options.presentation,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ ...editHandlers, pointer: options.pointer, meta: options.meta })
  });
}

function assertRangeSliderOptions<TMessage>(options: RangeSliderOptions<TMessage>): void {
  const min = options.range?.min ?? 0;
  const max = options.range?.max ?? 100;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new RangeError('rangeSlider range must have finite ordered bounds.');
  }
  if (options.value.start < min || options.value.end > max || options.value.start > options.value.end) {
    throw new RangeError('rangeSlider value must be ordered and contained by range.');
  }
  if (options.step !== undefined && (!Number.isFinite(options.step) || options.step <= 0)) {
    throw new RangeError('rangeSlider step must be finite and greater than zero.');
  }
}
