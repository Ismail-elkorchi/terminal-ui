import {
  statusIndicatorAccessibleBase,
  richTextAccessibleBase,
  richTextBlock,
  textAccessibleBase,
  textAreaAccessibleBase,
  textAreaBlock,
  textAreaCursor,
  textAreaPointerOffset,
  textBlock,
} from '../text-widgets.ts';
import { statusIndicatorBlock } from '../feedback-visual.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget } from './support/common.ts';
import {
  drawScrollbars,
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode,
  textAreaScrollbarState
} from './support/scroll.ts';
import { textPointerHitTargets, textPointerMessageFactory } from '../text-pointer.ts';
import type { RendererMap } from './types.ts';

export const textRenderers = {
  text: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, textBlock(renderNode));
    },
    accessibility: ({ renderNode, id }) => textAccessibleBase(renderNode, id)
  },
  richText: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, richTextBlock(renderNode, layoutNode.bounds, theme));
    },
    accessibility: ({ renderNode, id }) => richTextAccessibleBase(renderNode, id)
  },
  textArea: {
    render: ({ renderNode, layoutNode, buffer, theme, focused }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, layoutNode.bounds, (contentBounds) => textAreaScrollbarState(renderNode, contentBounds), 'both');
      writeRenderBlock(buffer, scrollbars.contentBounds, textAreaBlock(renderNode, scrollbars.contentBounds, theme, focused));
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused, theme }) => textAreaAccessibleBase(renderNode, id, focused, layoutNode.bounds, theme),
    focusTargets: ({ renderNode, bounds, theme }) => [focusTarget(bounds, textAreaCursor(renderNode, bounds, theme))],
    hitTargets: ({ renderNode, bounds, theme }) => {
      const scrollbars = scrollbarsForRenderNode(renderNode, bounds, (contentBounds) => textAreaScrollbarState(renderNode, contentBounds), 'both');
      return [
        ...(renderNode.props.disabled === true
          ? []
          : textPointerHitTargets({
              id: `${renderNode.id ?? renderNode.kind}:text`,
              bounds: scrollbars.contentBounds,
              toMessage: textPointerMessageFactory(renderNode),
              offsetAt: (event) => textAreaPointerOffset(renderNode, scrollbars.contentBounds, theme, event)
            })),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  statusIndicator: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, statusIndicatorBlock(renderNode, theme));
    },
    accessibility: ({ renderNode, id }) => statusIndicatorAccessibleBase(renderNode, id)
  }
} satisfies RendererMap<'text' | 'richText' | 'textArea' | 'statusIndicator'>;
