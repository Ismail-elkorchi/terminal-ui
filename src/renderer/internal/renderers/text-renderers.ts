import {
  richTextAccessibleBase,
  richTextBlock,
  textAccessibleBase,
  textAreaAccessibleBase,
  textAreaBlock,
  textAreaCursor,
  textAreaPointerOffset,
  textBlock,
} from '../text-rendering.ts';
import { writeRenderBlock } from './support/block.ts';
import { focusTarget, hasKeyboardOrInputMap } from './support/common.ts';
import {
  drawScrollbars,
  scrollbarHitTargetsForRenderNode,
  scrollbarsForRenderNode,
  textAreaScrollbarState
} from './support/scroll.ts';
import { textPointerHitTargets } from '../text-pointer.ts';
import { textMeasurements } from './text-measurements.ts';
import type { RendererMap } from './types.ts';
import {
  disclosureAccessibleNode,
  disclosureBlock,
  disclosureChildBounds,
  disclosureHitTargets
} from '../disclosure.ts';

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
  disclosure: {
    measure: textMeasurements.disclosure,
    layout: ({ renderNode, bounds }) => disclosureChildBounds(renderNode, bounds),
    render: ({ renderNode, layoutNode, buffer, theme, renderChildren }) => {
      writeRenderBlock(
        buffer,
        {
          ...layoutNode.bounds,
          height: Math.min(1, layoutNode.bounds.height)
        },
        disclosureBlock(renderNode, renderNode.props.expanded, theme)
      );
      if (renderNode.props.expanded) renderChildren();
    },
    accessibility: ({
      renderNode,
      id,
      focusedTargetId,
      children
    }) => disclosureAccessibleNode(
      renderNode,
      id,
      focusedTargetId === 'toggle',
      children
    ),
    focusTargets: ({ renderNode, bounds }) =>
      renderNode.props.toActionMessage === undefined
        ? []
        : [{
            id: 'toggle',
            bounds: { ...bounds, height: Math.min(1, bounds.height) },
            disabled: false
          }],
    hitTargets: ({ renderNode, bounds }) =>
      disclosureHitTargets(renderNode, bounds)
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
    focusTargets: ({ renderNode, bounds, theme, widthProfile }) =>
      !hasKeyboardOrInputMap(renderNode)
        ? []
        : [focusTarget(bounds, textAreaCursor(renderNode, bounds, theme, widthProfile))],
    hitTargets: ({ renderNode, bounds, theme, widthProfile }) => {
      const toActionMessage = renderNode.props.toActionMessage;
      const scrollbars = scrollbarsForRenderNode(
        renderNode,
        bounds,
        (contentBounds) => textAreaScrollbarState(renderNode, contentBounds, theme, widthProfile),
        'both'
      );
      return [
        ...textPointerHitTargets({
              id: `${renderNode.id ?? renderNode.kind}:text`,
              bounds: scrollbars.contentBounds,
              focusTargetId: 'self',
              toMessage: toActionMessage === undefined
                ? undefined
                : (action) => toActionMessage({ kind: 'pointer', action }),
              offsetAt: (event) => textAreaPointerOffset(
                renderNode,
                scrollbars.contentBounds,
                theme,
                event,
                widthProfile
              )
            }),
        ...scrollbarHitTargetsForRenderNode(renderNode, scrollbars, scrollbars.state)
      ];
    }
  },
} satisfies RendererMap<'text' | 'richText' | 'disclosure' | 'textArea'>;
