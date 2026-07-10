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
import {
  activationKeyBindings,
  interactionProps,
  rangeSliderKeyBindings,
  sliderKeyBindings
} from '../factory-internals/interaction.ts';
import {
  layoutProps,
  optionalId,
  renderNodeChildren
} from '../factory-internals/layout.ts';
import {
  checkboxChoiceHandler,
  choiceHandler,
  choiceItemsForRenderer,
  colorOptionsForRenderer,
  colorSelectionHandler,
  dateDaysForRenderer,
  dateSelectionHandler
} from '../factory-internals/domain.ts';

export function form<const TChildren extends ElementChildren, const TMessage = never>(
  children: TChildren,
  options: FormOptions<TMessage> = {}
): Element<ElementChildrenMessage<TChildren> | TMessage> {
  type Message = ElementChildrenMessage<TChildren> | TMessage;
  return elementFromRenderNode<'form', Message>({
    ...optionalId(options.id),
    kind: 'form',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...layoutProps(options)
    },
    children: renderNodeChildren(children),
    ...interactionProps(options)
  });
}

export function field<const TChildren extends ElementChildren, const TMessage = never>(
  children: TChildren,
  options: FieldOptions<TMessage>
): Element<ElementChildrenMessage<TChildren> | TMessage> {
  type Message = ElementChildrenMessage<TChildren> | TMessage;
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
    ...interactionProps(options)
  });
}

export function label<const TMessage = never>(options: LabelOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode<'label', TMessage>({
    ...optionalId(options.id),
    kind: 'label',
    props: {
      text: options.text,
      ...(options.forId === undefined ? {} : { forId: options.forId }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled })
    },
    ...interactionProps(options)
  });
}

export function button<const TMessage = never>(options: ButtonOptions<TMessage>): Element<TMessage> {
  const keyMap = activationKeyBindings(options.onPress, options.keys);
  return elementFromRenderNode<'button', TMessage>({
    ...optionalId(options.id),
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
  const changeMessage = options.onChange?.(!options.checked);
  const keyMap = activationKeyBindings(changeMessage, options.keys);
  return elementFromRenderNode<'checkbox', TMessage>({
    ...optionalId(options.id),
    kind: 'checkbox',
    props: {
      label: options.label,
      checked: options.checked,
      ...(changeMessage === undefined ? {} : { message: changeMessage }),
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
  const changeMessage = options.onChange?.(!options.checked);
  const keyMap = activationKeyBindings(changeMessage, options.keys);
  return elementFromRenderNode<'toggleSwitch', TMessage>({
    ...optionalId(options.id),
    kind: 'toggleSwitch',
    props: {
      label: options.label,
      checked: options.checked,
      ...(options.onLabel === undefined ? {} : { onLabel: options.onLabel }),
      ...(options.offLabel === undefined ? {} : { offLabel: options.offLabel }),
      ...(changeMessage === undefined ? {} : { message: changeMessage }),
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
    ...optionalId(options.id),
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
    ...optionalId(options.id),
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
  const toMessage = checkboxChoiceHandler(options.onChange);
  return elementFromRenderNode<'checkboxList', TMessage>({
    ...optionalId(options.id),
    kind: 'checkboxList',
    props: {
      options: choiceItemsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function radioGroup<TValue, const TMessage = never>(options: RadioGroupOptions<TValue, TMessage>): Element<TMessage> {
  const toMessage = choiceHandler(options.onChange);
  return elementFromRenderNode<'radioGroup', TMessage>({
    ...optionalId(options.id),
    kind: 'radioGroup',
    props: {
      options: choiceItemsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function colorPicker<TValue, const TMessage = never>(options: ColorPickerOptions<TValue, TMessage>): Element<TMessage> {
  const toMessage = colorSelectionHandler(options.onChange);
  return elementFromRenderNode<'colorPicker', TMessage>({
    ...optionalId(options.id),
    kind: 'colorPicker',
    props: {
      options: colorOptionsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function datePicker<TValue, const TMessage = never>(options: DatePickerOptions<TValue, TMessage>): Element<TMessage> {
  const toMessage = dateSelectionHandler(options.onChange);
  return elementFromRenderNode<'datePicker', TMessage>({
    ...optionalId(options.id),
    kind: 'datePicker',
    props: {
      days: dateDaysForRenderer(options.days),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function selectBox<TValue, const TMessage = never>(options: SelectBoxOptions<TValue, TMessage>): Element<TMessage> {
  const toMessage = choiceHandler(options.onChange);
  return elementFromRenderNode<'selectBox', TMessage>({
    ...optionalId(options.id),
    kind: 'selectBox',
    props: {
      options: choiceItemsForRenderer(options.options),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(toMessage === undefined ? {} : { toMessage }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function textInput<const TMessage = never>(options: TextInputOptions<TMessage> = {}): Element<TMessage> {
  const keyMap = activationKeyBindings(options.onSubmit, options.keys);
  return elementFromRenderNode<'textInput', TMessage>({
    ...optionalId(options.id),
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
      onInput: options.onInput,
      onPaste: options.onPaste,
      meta: options.meta
    })
  });
}

export function numberInput<const TMessage = never>(options: NumberInputOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode<'numberInput', TMessage>({
    ...optionalId(options.id),
    kind: 'numberInput',
    props: {
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}
