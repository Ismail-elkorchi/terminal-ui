import {
  activityIndicatorAccessibleBase,
  activityIndicatorText,
  richTextAccessibleBase,
  richTextBlock,
  textAreaAccessibleBase,
  textAreaCursor,
  textAreaText
} from '../text-widgets.ts';
import { stringify } from '../widget-props.ts';
import { writeBlock, writeRenderBlock } from './support/block.ts';
import { focusTarget, widgetMessageHitTargets } from './support/common.ts';
import {
  drawScrollbars,
  scrollbarsForWidget,
  textAreaScrollbarState
} from './support/scroll.ts';
import { singleLineCursorColumn, visibleLineText } from '../text-display.ts';
import type { RendererMap } from './types.ts';

export const textRenderers = {
  text: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, stringify(widget.props['content']));
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'text',
      label: id,
      value: stringify(widget.props['content'])
    })
  },
  richText: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, richTextBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id }) => richTextAccessibleBase(widget, id)
  },
  inputField: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, visibleLineText(stringify(widget.props['value']), 0, node.bounds.width));
    },
    accessibility: ({ widget, id, focused }) => ({
      id,
      role: 'textbox',
      label: id,
      value: stringify(widget.props['value']),
      ...(focused ? { focused } : {})
    }),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, {
      row: bounds.row,
      column: bounds.column + singleLineCursorColumn(stringify(widget.props['value']), undefined, Math.max(0, bounds.width - 1))
    })],
    hitTargets: ({ widget, bounds }) => widgetMessageHitTargets(widget, bounds, 'input')
  },
  textArea: {
    render: ({ widget, node, buffer, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, textAreaScrollbarState(widget, node.bounds), 'both');
      writeBlock(buffer, scrollbars.contentBounds, textAreaText(widget, scrollbars.contentBounds));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, id, focused }) => textAreaAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => [focusTarget(bounds, textAreaCursor(widget, bounds))]
  },
  activityIndicator: {
    render: ({ widget, node, buffer, theme }) => {
      writeBlock(buffer, node.bounds, activityIndicatorText(widget, theme));
    },
    accessibility: ({ widget, id }) => activityIndicatorAccessibleBase(widget, id)
  }
} satisfies RendererMap<'text' | 'richText' | 'inputField' | 'textArea' | 'activityIndicator'>;
