import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
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
  textActionInputHandlers,
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
import { selectPopupRenderNode } from '../internal/select-popup.ts';
import {
  assertNumericControlValue,
  validatedNumericControlRange
} from '../internal/numeric-controls.ts';
import {
  normalizeCheckboxGroupState,
  normalizeColorSwatchPickerState,
  normalizeRadioGroupState,
  normalizeSelectState
} from '../../behavior/choice-controls.ts';

export function form<const TChildren extends ElementChildren>(
  children: TChildren,
  options: FormOptions = {}
): Element<ElementChildrenMessage<TChildren>> {
  type Message = ElementChildrenMessage<TChildren>;
  return componentElementFromRenderNode<'form', Message>({
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
  return componentElementFromRenderNode<'field', Message>({
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
  return componentElementFromRenderNode<'label'>({
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
  { readonly onPress: TPressMessage },
  TKeys,
  TPointerMessage
>): Element<TPressMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function button(options: ButtonOptions<unknown>): Element<unknown> {
  const state = options.state ?? 'idle';
  const onPress = options.onPress;
  const keyMap = activationKeyBindings(
    onPress === undefined || options.disabled === true || state === 'pending' ? undefined : () => onPress(),
    options.keys
  );
  return componentElementFromRenderNode<'button', unknown>({
    ...requiredId(options.id, 'button'),
    kind: 'button',
    props: {
      label: options.label,
      ...(options.leading === undefined ? {} : { leading: normalizeInlineContent(options.leading) }),
      ...(options.trailing === undefined ? {} : { trailing: normalizeInlineContent(options.trailing) }),
      ...(onPress === undefined ? {} : { toPressMessage: onPress }),
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
  return componentElementFromRenderNode<'checkbox', TMessage>({
    ...requiredId(options.id, 'checkbox'),
    kind: 'checkbox',
    props: {
      label: options.label,
      checked: options.checked,
      ...(toMessage === undefined ? {} : { toMessage }),
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
  return componentElementFromRenderNode<'toggleSwitch', TMessage>({
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
  const range = validatedNumericControlRange('slider', options);
  assertNumericControlValue('slider', options.value, range);
  const keyMap = sliderKeyBindings(options);
  return componentElementFromRenderNode<'slider', TMessage>({
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
  const range = validatedNumericControlRange('rangeSlider', {
    ...(options.range === undefined ? {} : { min: options.range.min, max: options.range.max }),
    ...(options.step === undefined ? {} : { step: options.step }),
    ...(options.width === undefined ? {} : { width: options.width })
  });
  assertNumericControlValue('rangeSlider', options.presentation.value.start, range);
  assertNumericControlValue('rangeSlider', options.presentation.value.end, range);
  if (options.presentation.value.start > options.presentation.value.end) {
    throw new RangeError('rangeSlider start value must be less than or equal to end value.');
  }
  const keyMap = rangeSliderKeyBindings(options);
  return componentElementFromRenderNode<'rangeSlider', TMessage>({
    ...requiredId(options.id, 'rangeSlider'),
    kind: 'rangeSlider',
    props: {
      ...(options.label === undefined ? {} : { label: options.label }),
      presentation: options.presentation,
      ...(options.range === undefined ? {} : { range: options.range }),
      ...(options.step === undefined ? {} : { step: options.step }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

export function checkboxGroup<TValue, const TMessage = never>(options: CheckboxGroupOptions<TValue, TMessage>): Element<TMessage> {
  const normalizedOptions = choiceItemsForRenderer(options.options);
  const presentation = normalizeCheckboxGroupState({
    selected: options.selected ?? [],
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, options.options);
  const keyMap = checkboxGroupKeyBindings(options);
  return componentElementFromRenderNode<'checkboxGroup', TMessage>({
    ...requiredId(options.id, 'checkboxGroup'),
    kind: 'checkboxGroup',
    props: {
      options: normalizedOptions,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(presentation.selected.length === 0 ? {} : { selected: presentation.selected }),
      ...(presentation.focused === undefined ? {} : { focused: presentation.focused }),
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
  const normalizedOptions = choiceItemsForRenderer(options.options);
  const presentation = normalizeRadioGroupState({
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, options.options);
  const keyMap = radioGroupKeyBindings(options);
  return componentElementFromRenderNode<'radioGroup', TMessage>({
    ...requiredId(options.id, 'radioGroup'),
    kind: 'radioGroup',
    props: {
      options: normalizedOptions,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(presentation.selected === undefined ? {} : { selected: presentation.selected }),
      ...(presentation.focused === undefined ? {} : { focused: presentation.focused }),
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
  const normalizedOptions = colorOptionsForRenderer(options.options);
  const presentation = normalizeColorSwatchPickerState({
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.focused === undefined ? {} : { focused: options.focused })
  }, options.options);
  const keyMap = colorSwatchPickerKeyBindings(options);
  return componentElementFromRenderNode<'colorSwatchPicker', TMessage>({
    ...requiredId(options.id, 'colorSwatchPicker'),
    kind: 'colorSwatchPicker',
    props: {
      options: normalizedOptions,
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(presentation.selected === undefined ? {} : { selected: presentation.selected }),
      ...(presentation.focused === undefined ? {} : { focused: presentation.focused }),
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
  TKeys,
  TPointerMessage
>): Element<TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function calendar(options: CalendarOptions<unknown>): Element<unknown> {
  const keyMap = calendarKeyBindings(options);
  const onAction = options.onAction;
  return componentElementFromRenderNode<'calendar', unknown>({
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
  const normalizedOptions = choiceItemsForRenderer(options.options);
  const presentation = normalizeSelectState(options.presentation, options.options);
  const popup = presentation.kind === 'open'
    ? selectPopupRenderNode({
        ownerId: options.id,
        options: normalizedOptions,
        presentation,
        ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
        ...(options.meta?.styles === undefined ? {} : { styles: options.meta.styles }),
        ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction })
      })
    : undefined;
  return componentElementFromRenderNode<'select', TMessage>({
    ...requiredId(options.id, 'select'),
    kind: 'select',
    props: {
      options: normalizedOptions,
      ...(options.label === undefined ? {} : { label: options.label }),
      presentation,
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.placement === undefined ? {} : { placement: options.placement }),
      maxVisibleOptions: selectVisibleOptionLimit(options.maxVisibleOptions),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(popup === undefined ? {} : { children: [popup] }),
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({ pointer: options.pointer, meta: options.meta })
  });
}

function selectVisibleOptionLimit(value: number | undefined): number {
  if (value === undefined) return 8;
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError('select maxVisibleOptions must be a positive finite number.');
  }
  return Math.max(1, Math.floor(value));
}

export function textInput<
  const TSubmitMessage = never,
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(options: IndependentInteractionOptions<
  TextInputOptions,
  {
    readonly onAction: TActionMessage;
    readonly onSubmit: TSubmitMessage;
  },
  TKeys,
  TPointerMessage
>): Element<TSubmitMessage | TActionMessage | TPointerMessage | ComponentKeyBindingMessages<TKeys>>;
export function textInput(options: TextInputOptions<unknown>): Element<unknown> {
  const presentation = options.presentation;
  const keyMap = textInputKeyBindings(options.onAction, options.onSubmit, presentation.value, options.keys);
  return componentElementFromRenderNode<'textInput', unknown>({
    ...requiredId(options.id, 'textInput'),
    kind: 'textInput',
    props: {
      value: presentation.value,
      cursor: presentation.cursor,
      ...(presentation.selection === undefined ? {} : { selection: presentation.selection }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.onAction === undefined ? {} : { toActionMessage: options.onAction }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error })
    },
    ...(keyMap === undefined ? {} : { keyMap }),
    ...interactionProps({
      ...textActionInputHandlers(options.onAction),
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
  return componentElementFromRenderNode<'numberInput', unknown>({
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
