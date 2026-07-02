import {
  activityIndicatorAccessibleBase,
  richTextAccessibleBase,
  richTextBlock,
  textAccessibleBase,
  textAreaAccessibleBase,
  textAreaBlock,
  textAreaCursor,
  textBlock,
} from '../text-widgets.ts';
import { activityIndicatorBlock } from '../feedback-visual.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import {
  drawScrollbars,
  scrollbarsForWidget,
  textAreaScrollbarState
} from './support/scroll.ts';
import type { RendererMap } from './types.ts';

export const textRenderers = {
  text: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, textBlock(widget));
    },
    accessibility: ({ widget, id }) => textAccessibleBase(widget, id)
  },
  richText: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, richTextBlock(widget, node.bounds));
    },
    accessibility: ({ widget, id }) => richTextAccessibleBase(widget, id)
  },
  textArea: {
    render: ({ widget, node, buffer, theme, focused }) => {
      const scrollbars = scrollbarsForWidget(widget, node.bounds, textAreaScrollbarState(widget, node.bounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, textAreaBlock(widget, scrollbars.contentBounds, theme, focused));
      drawScrollbars(buffer, scrollbars, theme);
    },
    accessibility: ({ widget, id, focused }) => textAreaAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds, theme }) => [focusTarget(bounds, textAreaCursor(widget, bounds, theme))]
  },
  activityIndicator: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, activityIndicatorBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => activityIndicatorAccessibleBase(widget, id)
  }
} satisfies RendererMap<'text' | 'richText' | 'textArea' | 'activityIndicator'>;
