import {
  buttonAccessibleBase,
  buttonBlock,
  checkboxAccessibleBase,
  checkboxBlock,
  controlHitTargets,
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
  radioGroupAccessibleBase,
  radioGroupAccessibleChildren,
  radioGroupBlock,
  selectBoxAccessibleBase,
  selectBoxAccessibleChildren,
  selectBoxBlock,
  textInputAccessibleBase,
  textInputBlock,
  textInputCursor
} from '../form-widgets.ts';
import { splitTracks } from '../regions.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import { fillLayoutSizes, layoutFlowOptions } from './support/layout.ts';
import type { RendererMap } from './types.ts';

export const formRenderers = {
  form: {
    layout: ({ widget, bounds }) => splitTracks(
      formContentBounds(widget, bounds),
      'vertical',
      fillLayoutSizes(widget.children?.length ?? 0),
      layoutFlowOptions(widget)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.node.bounds, formBlock(input.widget, input.node.bounds));
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => formAccessibleBase(widget, id, focused)
  },
  field: {
    layout: ({ widget, bounds }) => splitTracks(
      fieldContentBounds(widget, bounds),
      'vertical',
      fillLayoutSizes(widget.children?.length ?? 0),
      layoutFlowOptions(widget)
    ),
    render: (input) => {
      writeRenderBlock(input.buffer, input.node.bounds, fieldBlock(input.widget, input.node.bounds));
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => fieldAccessibleBase(widget, id, focused)
  },
  label: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, labelBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id }) => labelAccessibleBase(widget, id)
  },
  button: {
    render: ({ widget, node, buffer, focused }) => {
      writeRenderBlock(buffer, node.bounds, buttonBlock(widget, node.bounds, focused));
    },
    accessibility: ({ widget, id, focused }) => buttonAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => controlHitTargets(widget, bounds)
  },
  checkbox: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, checkboxBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => checkboxAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => controlHitTargets(widget, bounds)
  },
  radioGroup: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, radioGroupBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...radioGroupAccessibleBase(widget, id, focused),
      children: radioGroupAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => optionHitTargets(widget, bounds)
  },
  selectBox: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, selectBoxBlock(widget, node.bounds, theme));
    },
    accessibility: ({ widget, id, focused }) => ({
      ...selectBoxAccessibleBase(widget, id, focused),
      children: selectBoxAccessibleChildren(widget)
    }),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds)],
    hitTargets: ({ widget, bounds }) => optionHitTargets(widget, bounds)
  },
  textInput: {
    render: ({ widget, node, buffer, focused }) => {
      writeRenderBlock(buffer, node.bounds, textInputBlock(widget, node.bounds, focused));
    },
    accessibility: ({ widget, id, focused }) => textInputAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds, textInputCursor(widget, bounds))]
  },
  numberInput: {
    render: ({ widget, node, buffer, focused }) => {
      writeRenderBlock(buffer, node.bounds, numberInputBlock(widget, node.bounds, focused));
    },
    accessibility: ({ widget, id, focused }) => numberInputAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => widget.props['disabled'] === true ? [] : [focusTarget(bounds, numberInputCursor(widget, bounds))]
  }
} satisfies RendererMap<'form' | 'field' | 'label' | 'button' | 'checkbox' | 'radioGroup' | 'selectBox' | 'textInput' | 'numberInput'>;
