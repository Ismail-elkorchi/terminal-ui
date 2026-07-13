import {
  absoluteAccessibleBase,
  absoluteChildBounds,
  canvasAccessibleBase,
  overlayAccessibleBase,
  overlayChildBounds,
  renderCanvas,
  surfaceAccessibleBase,
  surfaceChildBounds
} from '../drawing-widgets.ts';
import { dividerAccessibleBase, renderDivider } from '../divider.ts';
import { drawSurfaceChrome } from '../surface.ts';
import { renderTooltip, tooltipAccessibleBase } from '../tooltip.ts';
import { focusTarget, hasKeyboardOrInputMap } from './support/common.ts';
import type { RendererMap } from './types.ts';

export const drawingRenderers = {
  canvas: {
    render: (input) => {
      renderCanvas(input);
    },
    accessibility: ({ renderNode, id, focused }) => canvasAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : []
  },
  surface: {
    layout: ({ renderNode, bounds }) => surfaceChildBounds(renderNode, bounds),
    render: (input) => {
      drawSurfaceChrome(input.buffer, input.layoutNode.bounds, input.renderNode, input.theme, input.focused);
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => surfaceAccessibleBase(renderNode, id, focused)
  },
  absolute: {
    layout: ({ renderNode, bounds }) => absoluteChildBounds(renderNode, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  overlay: {
    layout: ({ renderNode, bounds }) => overlayChildBounds(renderNode, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => overlayAccessibleBase(id, focused)
  },
  divider: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      renderDivider(renderNode, buffer, layoutNode.bounds, theme);
    },
    accessibility: ({ renderNode, id, focused }) => dividerAccessibleBase(renderNode, id, focused)
  },
  tooltip: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      renderTooltip(renderNode, buffer, layoutNode.bounds, theme);
    },
    accessibility: ({ renderNode, id, focused }) => tooltipAccessibleBase(renderNode, id, focused)
  }
} satisfies RendererMap<'canvas' | 'surface' | 'absolute' | 'overlay' | 'divider' | 'tooltip'>;
