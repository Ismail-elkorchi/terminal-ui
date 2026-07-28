import {
  buttonBlock,
  checkboxBlock,
  checkboxGroupBlock,
  colorSwatchPickerBlock,
  calendarBlock,
  fieldBlock,
  formBlock,
  labelBlock,
  numberInputBlock,
  radioGroupBlock,
  rangeSliderBlock,
  selectBlock,
  sliderBlock,
  textInputBlock,
  toggleSwitchBlock
} from '../forms/index.ts';
import { finiteNonNegativeIntegerOrZero } from '../../../foundation/validation.ts';
import { combineMeasurementsVertically, measureBlock } from '../measurement.ts';
import { numberProp } from '../render-node-props.ts';
import { childMeasurements, constrainedMeasureBounds } from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';

export const formMeasurements = {
  form: ({ renderNode, bounds, widthProfile, childCount, measureChild }) => combineMeasurementsVertically(
    [
      measureBlock(formBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile), { widthProfile }),
      combineMeasurementsVertically(
        childMeasurements(childCount, measureChild),
        finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'gap'))
      )
    ]
  ),
  field: ({ renderNode, bounds, widthProfile, childCount, measureChild }) => combineMeasurementsVertically(
    [
      measureBlock(fieldBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile), { widthProfile }),
      combineMeasurementsVertically(
        childMeasurements(childCount, measureChild),
        finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'gap'))
      )
    ]
  ),
  label: ({ renderNode, bounds, widthProfile }) => measureBlock(
    labelBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile),
    { widthProfile }
  ),
  button: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    buttonBlock(renderNode, constrainedMeasureBounds(bounds), false, theme, widthProfile),
    { widthProfile }
  ),
  checkbox: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    checkboxBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  toggleSwitch: ({ renderNode, bounds, widthProfile }) => measureBlock(
    toggleSwitchBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile),
    { widthProfile }
  ),
  slider: ({ renderNode, bounds, widthProfile }) => measureBlock(
    sliderBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile),
    { widthProfile }
  ),
  rangeSlider: ({ renderNode, bounds, widthProfile }) => measureBlock(
    rangeSliderBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile),
    { widthProfile }
  ),
  checkboxGroup: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    checkboxGroupBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  radioGroup: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    radioGroupBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  select: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    selectBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  colorSwatchPicker: ({ renderNode, bounds, widthProfile }) => measureBlock(
    colorSwatchPickerBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile),
    { widthProfile }
  ),
  calendar: ({ renderNode, bounds, widthProfile }) => measureBlock(
    calendarBlock(renderNode, constrainedMeasureBounds(bounds), widthProfile),
    { widthProfile }
  ),
  textInput: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    textInputBlock(renderNode, constrainedMeasureBounds(bounds), false, theme, widthProfile),
    { widthProfile }
  ),
  passwordInput: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    textInputBlock(renderNode, constrainedMeasureBounds(bounds), false, theme, widthProfile),
    { widthProfile }
  ),
  numberInput: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    numberInputBlock(renderNode, constrainedMeasureBounds(bounds), false, theme, widthProfile),
    { widthProfile }
  )
} satisfies RendererMeasurementMap<
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
