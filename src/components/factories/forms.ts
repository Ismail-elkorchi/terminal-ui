import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element, ElementChildren } from '../element.ts';
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

export function form<TMessage>(children: ElementChildren<TMessage>, options: FormOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
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

export function field<TMessage>(children: ElementChildren<TMessage>, options: FieldOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
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

export function label<TMessage>(options: LabelOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
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

export function button<TMessage>(options: ButtonOptions<TMessage>): Element<TMessage> {
  const keyMap = activationKeyBindings(options.onPress, options.keys);
  return elementFromRenderNode({
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

export function checkbox<TMessage>(options: CheckboxOptions<TMessage>): Element<TMessage> {
  const changeMessage = options.onChange?.(!options.checked);
  const keyMap = activationKeyBindings(changeMessage, options.keys);
  return elementFromRenderNode({
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

export function toggleSwitch<TMessage>(options: ToggleSwitchOptions<TMessage>): Element<TMessage> {
  const changeMessage = options.onChange?.(!options.checked);
  const keyMap = activationKeyBindings(changeMessage, options.keys);
  return elementFromRenderNode({
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

export function slider<TMessage>(options: SliderOptions<TMessage>): Element<TMessage> {
  const keyMap = sliderKeyBindings(options);
  return elementFromRenderNode({
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

export function rangeSlider<TMessage>(options: RangeSliderOptions<TMessage>): Element<TMessage> {
  const keyMap = rangeSliderKeyBindings(options);
  return elementFromRenderNode({
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

export function checkboxList<TValue, TMessage>(options: CheckboxListOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'checkboxList',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function radioGroup<TValue, TMessage>(options: RadioGroupOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'radioGroup',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function colorPicker<TValue, TMessage>(options: ColorPickerOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'colorPicker',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function datePicker<TValue, TMessage>(options: DatePickerOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'datePicker',
    props: {
      days: options.days,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.columns === undefined ? {} : { columns: options.columns }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function selectBox<TValue, TMessage>(options: SelectBoxOptions<TValue, TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'selectBox',
    props: {
      options: options.options,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onChange === undefined ? {} : { toMessage: options.onChange }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...interactionProps(options)
  });
}

export function textInput<TMessage>(options: TextInputOptions<TMessage> = {}): Element<TMessage> {
  const keyMap = activationKeyBindings(options.onSubmit, options.keys);
  return elementFromRenderNode({
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

export function numberInput<TMessage>(options: NumberInputOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
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
