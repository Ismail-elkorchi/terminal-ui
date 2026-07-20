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
import { textPointerHitTargets } from '../text-pointer.ts';
import { textMeasurements } from './text-measurements.ts';
import type { RendererMap } from './types.ts';

export const textRenderers = {
  text: {
    measure: textMeasurements.text,
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, textBlock(renderNode));
    },
    accessibility: ({ renderNode, id }) => textAccessibleBase(renderNode, id)
  },
  richText: {
    measure: textMeasurements.richText,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, richTextBlock(renderNode, layoutNode.bounds, theme, widthProfile));
    },
    accessibility: ({ renderNode, id }) => richTextAccessibleBase(renderNode, id)
  },
  textArea: {
    measure: textMeasurements.textArea,
    render: ({ renderNode, layoutNode, buffer, theme, focus, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        layoutNode.bounds,
        (contentBounds) => textAreaScrollbarState(renderNode, contentBounds, theme, widthProfile),
        'both'
      );
      writeRenderBlock(
        buffer,
        scrollbars.contentBounds,
        textAreaBlock(renderNode, scrollbars.contentBounds, theme, widthProfile, focus === 'self')
      );
      drawScrollbars(buffer, renderNode, scrollbars, theme);
    },
    accessibility: ({ renderNode, layoutNode, id, focused, theme, widthProfile }) => textAreaAccessibleBase(
      renderNode,
      id,
      focused,
      layoutNode.bounds,
      theme,
      widthProfile
    ),
    focusTargets: ({ renderNode, bounds, theme, widthProfile }) => [
      focusTarget(bounds, textAreaCursor(renderNode, bounds, theme, widthProfile))
    ],
    hitTargets: ({ renderNode, bounds, theme, widthProfile }) => {
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        bounds,
        (contentBounds) => textAreaScrollbarState(renderNode, contentBounds, theme, widthProfile),
        'both'
      );
      return [
        ...(renderNode.props.disabled === true
          ? []
          : textPointerHitTargets({
              id: `${renderNode.id ?? renderNode.kind}:text`,
              bounds: scrollbars.contentBounds,
              focusTargetId: 'self',
              toMessage: renderNode.props.toActionMessage === undefined
                ? undefined
                : (action) => renderNode.props.toActionMessage?.({ kind: 'pointer', action }),
              offsetAt: (event) => textAreaPointerOffset(
                renderNode,
                scrollbars.contentBounds,
                theme,
                event,
                widthProfile
              )
            })),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
  statusIndicator: {
    measure: textMeasurements.statusIndicator,
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, statusIndicatorBlock(renderNode, theme));
    },
    accessibility: ({ renderNode, id }) => statusIndicatorAccessibleBase(renderNode, id)
  }
} satisfies RendererMap<'text' | 'richText' | 'textArea' | 'statusIndicator'>;
