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
    accessibility: ({ widget, id, focused }) => canvasAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : []
  },
  surface: {
    layout: ({ widget, bounds }) => surfaceChildBounds(widget, bounds),
    render: (input) => {
      drawSurfaceChrome(input.buffer, input.node.bounds, input.widget, input.theme, input.focused);
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => surfaceAccessibleBase(widget, id, focused)
  },
  absolute: {
    layout: ({ widget, bounds }) => absoluteChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  overlay: {
    layout: ({ widget, bounds }) => overlayChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => overlayAccessibleBase(id, focused)
  },
  divider: {
    render: ({ widget, node, buffer }) => {
      renderDivider(widget, buffer, node.bounds);
    },
    accessibility: ({ widget, id, focused }) => dividerAccessibleBase(widget, id, focused)
  },
  tooltip: {
    render: ({ widget, node, buffer, theme }) => {
      renderTooltip(widget, buffer, node.bounds, theme);
    },
    accessibility: ({ widget, id, focused }) => tooltipAccessibleBase(widget, id, focused)
  }
} satisfies RendererMap<'canvas' | 'surface' | 'absolute' | 'overlay' | 'divider' | 'tooltip'>;
