import {
  activityIndicatorAccessibleBase,
  richTextAccessibleBase,
  richTextBlock,
  textAccessibleBase,
  textAreaAccessibleBase,
  textAreaBlock,
  textAreaCursor,
  textAreaPointerOffset,
  textBlock,
} from '../text-widgets.ts';
import { activityIndicatorBlock } from '../feedback-visual.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import {
  drawScrollbars,
  scrollbarHitTargetsForWidget,
  scrollbarsForWidget,
  textAreaScrollbarState
} from './support/scroll.ts';
import { textPointerHitTargets, textPointerMessageFactory } from '../text-pointer.ts';
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
      const scrollbars = scrollbarsForWidget(widget, node.bounds, (contentBounds) => textAreaScrollbarState(widget, contentBounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, textAreaBlock(widget, scrollbars.contentBounds, theme, focused));
      drawScrollbars(buffer, widget, scrollbars, theme);
    },
    accessibility: ({ widget, node, id, focused, theme }) => textAreaAccessibleBase(widget, id, focused, node.bounds, theme),
    focusTargets: ({ widget, bounds, theme }) => [focusTarget(bounds, textAreaCursor(widget, bounds, theme))],
    hitTargets: ({ widget, bounds, theme }) => {
      const scrollbars = scrollbarsForWidget(widget, bounds, (contentBounds) => textAreaScrollbarState(widget, contentBounds), 'both');
      return [
        ...(widget.props['disabled'] === true
          ? []
          : textPointerHitTargets({
              id: `${widget.id ?? widget.kind}:text`,
              bounds: scrollbars.contentBounds,
              toMessage: textPointerMessageFactory(widget),
              offsetAt: (event) => textAreaPointerOffset(widget, scrollbars.contentBounds, theme, event)
            })),
        ...scrollbarHitTargetsForWidget(widget, scrollbars, scrollbars.state)
      ];
    }
  },
  activityIndicator: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, activityIndicatorBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => activityIndicatorAccessibleBase(widget, id)
  }
} satisfies RendererMap<'text' | 'richText' | 'textArea' | 'activityIndicator'>;
