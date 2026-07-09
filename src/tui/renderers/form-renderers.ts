import {
  buttonAccessibleBase,
  buttonBlock,
  checkboxAccessibleBase,
  checkboxBlock,
  checkboxListAccessibleBase,
  checkboxListAccessibleChildren,
  checkboxListBlock,
  checkboxListHitTargets,
  colorPickerAccessibleBase,
  colorPickerAccessibleChildren,
  colorPickerBlock,
  controlHitTargets,
  datePickerAccessibleBase,
  datePickerAccessibleChildren,
  datePickerBlock,
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
  optionHitTargets,
  pickerHitTargets,
  radioGroupAccessibleBase,
  radioGroupAccessibleChildren,
  radioGroupBlock,
  rangeSliderAccessibleBase,
  rangeSliderBlock,
  rangeSliderHitTargets,
  selectBoxAccessibleBase,
  selectBoxAccessibleChildren,
  selectBoxBlock,
  sliderAccessibleBase,
  sliderBlock,
  sliderHitTargets,
  textInputAccessibleBase,
  textInputBlock,
  textInputCursor,
  toggleSwitchAccessibleBase,
  toggleSwitchBlock
} from '../form-widgets.ts';
import { singleLineInputPointerOffset } from '../input-visual.ts';
import { splitTracks } from '../regions.ts';
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
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, checkboxBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => checkboxAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  toggleSwitch: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, toggleSwitchBlock(renderNode, layoutNode.bounds));
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
  checkboxList: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, checkboxListBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...checkboxListAccessibleBase(renderNode, id, focused),
      children: checkboxListAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => checkboxListHitTargets(renderNode, bounds)
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
  selectBox: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, selectBoxBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...selectBoxAccessibleBase(renderNode, id, focused),
      children: selectBoxAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => optionHitTargets(renderNode, bounds)
  },
  colorPicker: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, colorPickerBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...colorPickerAccessibleBase(renderNode, id, focused),
      children: colorPickerAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => pickerHitTargets(renderNode, bounds)
  },
  datePicker: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, datePickerBlock(renderNode, layoutNode.bounds));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...datePickerAccessibleBase(renderNode, id, focused),
      children: datePickerAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => pickerHitTargets(renderNode, bounds)
  },
  textInput: {
    render: ({ renderNode, layoutNode, buffer, focused, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, textInputBlock(renderNode, layoutNode.bounds, focused, theme));
    },
    accessibility: ({ renderNode, id, focused }) => textInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, textInputCursor(renderNode, bounds))],
    hitTargets: ({ renderNode, bounds, theme }) => [
      ...widgetMessageHitTargets(renderNode, bounds, 'input'),
      ...(renderNode.props['disabled'] === true
        ? []
        : textPointerHitTargets({
            id: `${renderNode.id ?? renderNode.kind}:text`,
            bounds,
            toMessage: textPointerMessageFactory(renderNode),
            offsetAt: (event) => singleLineInputPointerOffset({
              widget: renderNode,
              bounds,
              theme,
              value: stringify(renderNode.props['value']),
              placeholder: stringify(renderNode.props['placeholder'])
            }, event)
          }))
    ]
  },
  numberInput: {
    render: ({ renderNode, layoutNode, buffer, focused, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, numberInputBlock(renderNode, layoutNode.bounds, focused, theme));
    },
    accessibility: ({ renderNode, id, focused }) => numberInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds }) => [focusTarget(bounds, numberInputCursor(renderNode, bounds))]
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
  | 'checkboxList'
  | 'radioGroup'
  | 'selectBox'
  | 'colorPicker'
  | 'datePicker'
  | 'textInput'
  | 'numberInput'
>;
