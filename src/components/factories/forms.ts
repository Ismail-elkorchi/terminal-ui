import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element, ElementChildren, ElementChildrenMessage } from '../element.ts';
import type {
  ButtonOptions,
  CheckboxListOptions,
  CheckboxOptions,
  ColorPickerOptions,
  DatePickerOptions,
  FieldOptions,
  FormOptions,
  LabelOptions,
  NumberInputOptions,
  RadioGroupOptions,
  RangeSliderOptions,
  SelectBoxOptions,
  SliderOptions,
  TextInputOptions,
  ToggleSwitchOptions
} from '../options/forms.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredComponentKeyBindings
} from '../factory-internals/messages.ts';
import {
  activationKeyBindings,
  checkboxListKeyBindings,
  colorPickerKeyBindings,
  componentMetaProps,
  datePickerKeyBindings,
  interactionProps,
  numberInputKeyBindings,
  radioGroupKeyBindings,
  rangeSliderKeyBindings,
  sliderKeyBindings,
  selectBoxKeyBindings,
  textEditInputHandlers,
  textInputKeyBindings
} from '../factory-internals/interaction.ts';
import {
  layoutProps,
  optionalId,
  requiredId,
  renderNodeChildren
} from '../factory-internals/render-node.ts';
import { choiceItemsForRenderer, colorOptionsForRenderer } from '../factory-internals/domain.ts';

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

export function button<const TMessage = never>(options: ButtonOptions<TMessage>): Element<TMessage> {
  const keyMap = activationKeyBindings(
    options.onPress === undefined ? undefined : () => options.onPress,
    options.keys
  );
  return elementFromRenderNode<'button', TMessage>({
    ...requiredId(options.id, 'button'),
    kind: 'button',
    props: {
      label: options.label,
      ...(options.onPress === undefined ? {} : { message: options.onPress }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.tone === undefined ? {} : { tone: options.tone }),
      ...(options.pressed === undefined ? {} : { pressed: options.pressed }),
      ...(options.pending === undefined ? {} : { pending: options.pending })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
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
    ...interactionProps({ meta: options.meta })
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
    ...interactionProps({ meta: options.meta })
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
    ...interactionProps({ meta: options.meta })
  });
}

export function rangeSlider<const TMessage = never>(options: RangeSliderOptions<TMessage>): Element<TMessage> {
  const keyMap = rangeSliderKeyBindings(options);
  return elementFromRenderNode<'rangeSlider', TMessage>({
    ...requiredId(options.id, 'rangeSlider'),
    kind: 'rangeSlider',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      start: options.start,
      end: options.end,
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ meta: options.meta })
  });
}

export function checkboxList<TValue, const TMessage = never>(options: CheckboxListOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = checkboxListKeyBindings(options);
  return elementFromRenderNode<'checkboxList', TMessage>({
    ...requiredId(options.id, 'checkboxList'),
    kind: 'checkboxList',
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
    ...interactionProps({ meta: options.meta })
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
    ...interactionProps({ meta: options.meta })
  });
}

export function colorPicker<TValue, const TMessage = never>(options: ColorPickerOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = colorPickerKeyBindings(options);
  return elementFromRenderNode<'colorPicker', TMessage>({
    ...requiredId(options.id, 'colorPicker'),
    kind: 'colorPicker',
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
    ...interactionProps({ meta: options.meta })
  });
}

export function datePicker<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  DatePickerOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
export function datePicker(options: DatePickerOptions<unknown>): Element<unknown> {
  const keyMap = datePickerKeyBindings(options);
  const onAction = options.onAction;
  return elementFromRenderNode<'datePicker', unknown>({
    ...requiredId(options.id, 'datePicker'),
    kind: 'datePicker',
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
    ...interactionProps({ meta: options.meta })
  });
}

export function selectBox<TValue, const TMessage = never>(options: SelectBoxOptions<TValue, TMessage>): Element<TMessage> {
  const keyMap = selectBoxKeyBindings(options);
  return elementFromRenderNode<'selectBox', TMessage>({
    ...requiredId(options.id, 'selectBox'),
    kind: 'selectBox',
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
    ...interactionProps({ meta: options.meta })
  });
}

export function textInput<
  const TSubmitMessage = never,
  const TTextPointerMessage = never,
  const TEditMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  TextInputOptions,
  {
    readonly onTextPointer: TTextPointerMessage;
    readonly onEdit: TEditMessage;
  },
  { readonly onSubmit: TSubmitMessage },
  TKeys
>): Element<TSubmitMessage | TTextPointerMessage | TEditMessage | ComponentKeyBindingMessages<TKeys>>;
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
      meta: options.meta
    })
  });
}

export function numberInput<
  const TActionMessage = never,
  const TKeys extends InferredComponentKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  NumberInputOptions,
  { readonly onAction: TActionMessage },
  Record<never, never>,
  TKeys
>): Element<TActionMessage | ComponentKeyBindingMessages<TKeys>>;
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
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.committedValue === undefined ? {} : { committedValue: options.committedValue }),
      ...(options.parsedValue === undefined ? {} : { parsedValue: options.parsedValue }),
      ...(options.validity === undefined ? {} : { validity: options.validity }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ ...editHandlers, meta: options.meta })
  });
}
