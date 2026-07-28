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
  passwordInputAccessibleBase,
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
  selectHitTargets,
  selectPopupBounds,
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
import { textPointerHitTargets } from '../text-pointer.ts';
import { stringify } from '../render-node-props.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusHitTargets, focusTarget } from './support/common.ts';
import { layoutFlowOptions } from './support/layout.ts';
import { formMeasurements } from './form-measurements.ts';
import type { RendererMap } from './types.ts';

export const formRenderers = {
  form: {
    measure: formMeasurements.form,
    layout: ({ renderNode, bounds, measureChild }) => splitTracks(
      formContentBounds(renderNode, bounds),
      'vertical',
      Array.from({ length: renderNode.children?.length ?? 0 }, () => ({ kind: 'content' as const })),
      layoutFlowOptions(renderNode),
      (renderNode.children ?? []).map((_child, index) => measureChild(index).preferredHeight)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, formBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.widthProfile
      ));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => formAccessibleBase(renderNode, id, focused)
  },
  field: {
    measure: formMeasurements.field,
    layout: ({ renderNode, bounds, measureChild }) => splitTracks(
      fieldContentBounds(renderNode, bounds),
      'vertical',
      Array.from({ length: renderNode.children?.length ?? 0 }, () => ({ kind: 'content' as const })),
      layoutFlowOptions(renderNode),
      (renderNode.children ?? []).map((_child, index) => measureChild(index).preferredHeight)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.layoutNode.bounds, fieldBlock(
        input.renderNode,
        input.layoutNode.bounds,
        input.widthProfile
      ));
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => fieldAccessibleBase(renderNode, id, focused)
  },
  label: {
    measure: formMeasurements.label,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, labelBlock(renderNode, layoutNode.bounds, widthProfile));
    },
    accessibility: ({ renderNode, id }) => labelAccessibleBase(renderNode, id)
  },
  button: {
    measure: formMeasurements.button,
    render: ({ renderNode, layoutNode, buffer, focus, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, buttonBlock(
        renderNode,
        layoutNode.bounds,
        focus === 'self',
        theme,
        widthProfile,
        true
      ));
    },
    accessibility: ({ renderNode, id, focused }) => buttonAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  checkbox: {
    measure: formMeasurements.checkbox,
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, checkboxBlock(
        renderNode,
        layoutNode.bounds,
        theme,
        widthProfile,
        focus === 'self',
        true
      ));
    },
    accessibility: ({ renderNode, id, focused }) => checkboxAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  toggleSwitch: {
    measure: formMeasurements.toggleSwitch,
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, toggleSwitchBlock(
        renderNode,
        layoutNode.bounds,
        theme,
        widthProfile,
        focus === 'self',
        true
      ));
    },
    accessibility: ({ renderNode, id, focused }) => toggleSwitchAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => controlHitTargets(renderNode, bounds)
  },
  slider: {
    measure: formMeasurements.slider,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, sliderBlock(renderNode, layoutNode.bounds, widthProfile));
    },
    accessibility: ({ renderNode, id, focused }) => sliderAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => sliderHitTargets(renderNode, bounds, widthProfile)
  },
  rangeSlider: {
    measure: formMeasurements.rangeSlider,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, rangeSliderBlock(renderNode, layoutNode.bounds, widthProfile));
    },
    accessibility: ({ renderNode, id, focused }) => rangeSliderAccessibleBase(renderNode, id, focused),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => rangeSliderHitTargets(renderNode, bounds, widthProfile)
  },
  checkboxGroup: {
    measure: formMeasurements.checkboxGroup,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, checkboxGroupBlock(
        renderNode,
        layoutNode.bounds,
        theme,
        widthProfile,
        true
      ));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...checkboxGroupAccessibleBase(renderNode, id, focused),
      children: checkboxGroupAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => checkboxGroupHitTargets(renderNode, bounds)
  },
  radioGroup: {
    measure: formMeasurements.radioGroup,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, radioGroupBlock(
        renderNode,
        layoutNode.bounds,
        theme,
        widthProfile,
        true
      ));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...radioGroupAccessibleBase(renderNode, id, focused),
      children: radioGroupAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => optionHitTargets(renderNode, bounds)
  },
  select: {
    measure: formMeasurements.select,
    layout: ({ renderNode, bounds, viewport, widthProfile }) => selectPopupBounds(
      renderNode,
      bounds,
      viewport,
      widthProfile
    ),
    render: (input) => {
      writeRenderBlock(
        input.buffer,
        input.layoutNode.bounds,
        selectBlock(input.renderNode, input.layoutNode.bounds, input.theme, input.widthProfile, true)
      );
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...selectAccessibleBase(renderNode, id, focused),
      children: selectAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, layoutNode }) => selectHitTargets(renderNode, layoutNode)
  },
  colorSwatchPicker: {
    measure: formMeasurements.colorSwatchPicker,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, colorSwatchPickerBlock(
        renderNode,
        layoutNode.bounds,
        widthProfile
      ));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...colorSwatchPickerAccessibleBase(renderNode, id, focused),
      children: colorSwatchPickerAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds }) => pickerHitTargets(renderNode, bounds)
  },
  calendar: {
    measure: formMeasurements.calendar,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, calendarBlock(renderNode, layoutNode.bounds, widthProfile));
    },
    accessibility: ({ renderNode, id, focused }) => ({
      ...calendarAccessibleBase(renderNode, id, focused),
      children: calendarAccessibleChildren(renderNode)
    }),
    focusTargets: ({ bounds }) => [focusTarget(bounds)],
    hitTargets: ({ renderNode, bounds, widthProfile }) => [
      ...calendarNavigationHitTargets(renderNode, bounds, widthProfile),
      ...pickerHitTargets(renderNode, bounds)
    ]
  },
  textInput: {
    measure: formMeasurements.textInput,
    render: ({ renderNode, layoutNode, buffer, focus, theme, widthProfile }) => {
      writeRenderBlock(
        buffer,
        layoutNode.bounds,
        textInputBlock(renderNode, layoutNode.bounds, focus === 'self', theme, widthProfile)
      );
    },
    accessibility: ({ renderNode, id, focused }) => textInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds, theme, widthProfile }) => [
      focusTarget(bounds, textInputCursor(renderNode, bounds, theme, widthProfile))
    ],
    hitTargets: ({ renderNode, bounds, theme, widthProfile }) => [
      ...focusHitTargets(renderNode, bounds, 'input'),
      ...(renderNode.props.disabled === true
        ? []
        : textPointerHitTargets({
            id: `${renderNode.id ?? renderNode.kind}:text`,
            bounds,
            focusTargetId: 'self',
            toMessage: renderNode.props.toActionMessage === undefined
              ? undefined
              : (action) => renderNode.props.toActionMessage?.({ kind: 'pointer', action }),
            offsetAt: (event) => singleLineInputPointerOffset({
              renderNode: renderNode,
              bounds,
              theme,
              widthProfile,
              value: stringify(renderNode.props.value),
              placeholder: stringify(renderNode.props.placeholder)
            }, event)
          }))
    ]
  },
  passwordInput: {
    measure: formMeasurements.passwordInput,
    render: ({ renderNode, layoutNode, buffer, focus, theme, widthProfile }) => {
      writeRenderBlock(
        buffer,
        layoutNode.bounds,
        textInputBlock(renderNode, layoutNode.bounds, focus === 'self', theme, widthProfile)
      );
    },
    accessibility: ({ renderNode, id, focused }) => passwordInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds, theme, widthProfile }) => [
      focusTarget(bounds, textInputCursor(renderNode, bounds, theme, widthProfile))
    ],
    hitTargets: ({ renderNode, bounds, theme, widthProfile }) => [
      ...focusHitTargets(renderNode, bounds, 'input'),
      ...(renderNode.props.disabled === true
        ? []
        : textPointerHitTargets({
            id: `${renderNode.id ?? renderNode.kind}:text`,
            bounds,
            focusTargetId: 'self',
            toMessage: renderNode.props.toActionMessage === undefined
              ? undefined
              : (action) => renderNode.props.toActionMessage?.({ kind: 'pointer', action }),
            offsetAt: (event) => singleLineInputPointerOffset({
              renderNode,
              bounds,
              theme,
              widthProfile,
              value: stringify(renderNode.props.value),
              placeholder: stringify(renderNode.props.placeholder)
            }, event)
          }))
    ]
  },
  numberInput: {
    measure: formMeasurements.numberInput,
    render: ({ renderNode, layoutNode, buffer, focus, theme, widthProfile }) => {
      writeRenderBlock(
        buffer,
        layoutNode.bounds,
        numberInputBlock(renderNode, layoutNode.bounds, focus === 'self', theme, widthProfile)
      );
    },
    accessibility: ({ renderNode, id, focused }) => numberInputAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds, theme, widthProfile }) => [
      focusTarget(bounds, numberInputCursor(renderNode, bounds, theme, widthProfile))
    ],
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
  | 'passwordInput'
  | 'numberInput'
>;
