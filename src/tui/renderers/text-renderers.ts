import {
  activityIndicatorAccessibleBase,
  richTextAccessibleBase,
  richTextBlock,
  textAreaAccessibleBase,
  textAreaBlock,
  textAreaCursor,
} from '../text-widgets.ts';
import { activityIndicatorBlock } from '../feedback-visual.ts';
import { stringify } from '../widget-props.ts';
import { block, line, span } from '../frame.ts';
import { defaultStyleForTextRole } from '../widget-style.ts';
import { singleLineInputBlock, singleLineInputCursor } from '../input-visual.ts';
import { writeBlock, writeRenderBlock } from './support/block.ts';
import { focusTarget, widgetMessageHitTargets } from './support/common.ts';
import {
  drawScrollbars,
  scrollbarsForWidget,
  textAreaScrollbarState
} from './support/scroll.ts';
import type { RendererMap } from './types.ts';

export const textRenderers = {
  text: {
    render: ({ widget, node, buffer }) => {
      const style = textRoleStyle(widget.props['textRole']);
      if (style === undefined) {
        writeBlock(buffer, node.bounds, stringify(widget.props['content']));
        return;
      }
      writeRenderBlock(buffer, node.bounds, block([line([span(stringify(widget.props['content']), { style })])]));
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
    render: ({ widget, node, buffer, focused, theme }) => {
      writeRenderBlock(buffer, node.bounds, singleLineInputBlock({
        widget,
        bounds: node.bounds,
        theme,
        value: stringify(widget.props['value']),
        focused
      }));
    },
    accessibility: ({ widget, id, focused }) => ({
      id,
      role: 'textbox',
      label: id,
      value: stringify(widget.props['value']),
      ...(focused ? { focused } : {})
    }),
    focusTargets: ({ widget, bounds, theme }) => [focusTarget(bounds, singleLineInputCursor({
      widget,
      bounds,
      theme,
      value: stringify(widget.props['value']),
      focused: true
    }))],
    hitTargets: ({ widget, bounds }) => widgetMessageHitTargets(widget, bounds, 'input')
  },
  textArea: {
    render: ({ widget, node, buffer, theme, focused }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, textAreaScrollbarState(widget, node.bounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, textAreaBlock(widget, scrollbars.contentBounds, theme, focused));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, id, focused }) => textAreaAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds, theme }) => widget.props['disabled'] === true
      ? []
      : [focusTarget(bounds, textAreaCursor(widget, bounds, theme))]
  },
  activityIndicator: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, activityIndicatorBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => activityIndicatorAccessibleBase(widget, id)
  }
} satisfies RendererMap<'text' | 'richText' | 'inputField' | 'textArea' | 'activityIndicator'>;

function textRoleStyle(value: unknown) {
  return value === 'title'
    || value === 'subtitle'
    || value === 'heading'
    || value === 'body'
    || value === 'caption'
    || value === 'metadata'
    || value === 'metric'
    || value === 'badge'
    || value === 'danger'
    || value === 'warning'
    || value === 'success'
    ? defaultStyleForTextRole(value)
    : undefined;
}
