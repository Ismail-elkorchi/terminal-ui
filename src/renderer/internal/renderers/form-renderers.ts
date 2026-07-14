import {
  buttonAccessibleBase,
  buttonBlock,
  checkboxAccessibleBase,
  checkboxBlock,
  checkboxGroupAccessibleBase,
  checkboxGroupAccessibleChildren,
  checkboxGroupBlock,
  checkboxGroupHitTargets,
  colorSwatchPickerAccessibleBase,
  colorSwatchPickerAccessibleChildren,
  colorSwatchPickerBlock,
  controlHitTargets,
  calendarAccessibleBase,
  calendarAccessibleChildren,
  calendarBlock,
  calendarNavigationHitTargets,
  fieldAccessibleBase,
  fieldBlock,
  fieldContentBounds,
  formAccessibleBase,
  formBlock,
  formContentBounds,
  labelAccessibleBase,
  labelBlock,
  numberInputAccessibleBase,
  numberInputBlock,
  numberInputCursor,
  numberInputHitTargets,
  optionHitTargets,
  pickerHitTargets,
  radioGroupAccessibleBase,
  radioGroupAccessibleChildren,
  radioGroupBlock,
  rangeSliderAccessibleBase,
  rangeSliderBlock,
  rangeSliderHitTargets,
  selectAccessibleBase,
  selectAccessibleChildren,
  selectBlock,
  sliderAccessibleBase,
  sliderBlock,
  sliderHitTargets,
  textInputAccessibleBase,
  textInputBlock,
  textInputCursor,
  toggleSwitchAccessibleBase,
  toggleSwitchBlock
} from '../forms/index.ts';
import { singleLineInputPointerOffset } from '../input-visual.ts';
import { splitTracks } from '../layout-geometry.ts';
import { textPointerHitTargets, textPointerMessageFactory } from '../text-pointer.ts';
import { stringify } from '../render-node-props.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget, widgetMessageHitTargets } from './support/common.ts';
import { fillLayoutSizes, layoutFlowOptions } from './support/layout.ts';
import type { RendererMap } from './types.ts';

export const formRenderers = {
  form: {
    layout: ({ renderNode, bounds }) => splitTracks(
      formContentBounds(renderNode, bounds),
      'vertical',
      fillLayoutSizes(renderNode.children?.length ?? 0),
      layoutFlowOptions(renderNode)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, formBlock(input.renderNode, input.layoutNode.bounds));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => formAccessibleBase(renderNode, id, focused)
  },
  field: {
    layout: ({ renderNode, bounds }) => splitTracks(
      fieldContentBounds(renderNode, bounds),
      'vertical',
      fillLayoutSizes(renderNode.children?.length ?? 0),
      layoutFlowOptions(renderNode)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, fieldBlock(input.renderNode, input.layoutNode.bounds));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => fieldAccessibleBase(renderNode, id, focused)
  },
  label: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, labelBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id }) => labelAccessibleBase(renderNode, id)
  },
  button: {
    render: ({ renderNode, layoutNode, buffer, focused, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, buttonBlock(renderNode, layoutNode.bounds, focused, theme));
    },
    accessibility: ({ renderNode, id, focused }) => buttonAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  checkbox: {
    render: ({ renderNode, layoutNode, buffer, theme, focused }) => {
      writeRenderBlock(buffer, layoutNode.bounds, checkboxBlock(renderNode, layoutNode.bounds, theme, focused));
    },
    accessibility: ({ renderNode, id, focused }) => checkboxAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  toggleSwitch: {
    render: ({ renderNode, layoutNode, buffer, focused }) => {
      writeRenderBlock(buffer, layoutNode.bounds, toggleSwitchBlock(renderNode, layoutNode.bounds, focused));
    },
    accessibility: ({ renderNode, id, focused }) => toggleSwitchAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  slider: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, sliderBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id, focused }) => sliderAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => sliderHitTargets(renderNode, bounds)
  },
  rangeSlider: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, rangeSliderBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id, focused }) => rangeSliderAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => rangeSliderHitTargets(renderNode, bounds)
  },
  checkboxGroup: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, checkboxGroupBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...checkboxGroupAccessibleBase(renderNode, id, focused),
      children: checkboxGroupAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => checkboxGroupHitTargets(renderNode, bounds)
  },
  radioGroup: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, radioGroupBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...radioGroupAccessibleBase(renderNode, id, focused),
      children: radioGroupAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => optionHitTargets(renderNode, bounds)
  },
  select: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, selectBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...selectAccessibleBase(renderNode, id, focused),
      children: selectAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => optionHitTargets(renderNode, bounds)
  },
  colorSwatchPicker: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, colorSwatchPickerBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...colorSwatchPickerAccessibleBase(renderNode, id, focused),
      children: colorSwatchPickerAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => pickerHitTargets(renderNode, bounds)
  },
  calendar: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, calendarBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...calendarAccessibleBase(renderNode, id, focused),
      children: calendarAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => [
      ...calendarNavigationHitTargets(renderNode, bounds),
      ...pickerHitTargets(renderNode, bounds)
    ]
  },
  textInput: {
    render: ({ renderNode, layoutNode, buffer, focused, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, textInputBlock(renderNode, layoutNode.bounds, focused, theme));
    },
    accessibility: ({ renderNode, id, focused }) => textInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, textInputCursor(renderNode, bounds))],
    hitTargets: ({ renderNode, bounds, theme }) => [
      ...widgetMessageHitTargets(renderNode, bounds, 'input'),
      ...(renderNode.props.disabled === true
        ? []
        : textPointerHitTargets({
            id: `${renderNode.id ?? renderNode.kind}:text`,
            bounds,
            toMessage: textPointerMessageFactory(renderNode),
            offsetAt: (event) => singleLineInputPointerOffset({
              widget: renderNode,
              bounds,
              theme,
              value: stringify(renderNode.props.value),
              placeholder: stringify(renderNode.props.placeholder)
            }, event)
          }))
    ]
  },
  numberInput: {
    render: ({ renderNode, layoutNode, buffer, focused, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, numberInputBlock(renderNode, layoutNode.bounds, focused, theme));
    },
    accessibility: ({ renderNode, id, focused }) => numberInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, numberInputCursor(renderNode, bounds))],
    hitTargets: ({ renderNode, bounds }) => numberInputHitTargets(renderNode, bounds)
  }
} satisfies RendererMap<
  | 'form'
  | 'field'
  | 'label'
  | 'button'
  | 'checkbox'
  | 'toggleSwitch'
  | 'slider'
  | 'rangeSlider'
  | 'checkboxGroup'
  | 'radioGroup'
  | 'select'
  | 'colorSwatchPicker'
  | 'calendar'
  | 'textInput'
  | 'numberInput'
>;
