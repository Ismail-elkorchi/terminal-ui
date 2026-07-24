import {
  absoluteAccessibleBase,
  absoluteChildBounds,
  canvasAccessibleBase,
  overlayAccessibleBase,
  overlayChildBounds,
  renderCanvas,
  surfaceAccessibleBase,
  surfaceChildBounds
} from '../drawing-rendering.ts';
import { dividerAccessibleBase, renderDivider } from '../divider.ts';
import { drawSurfaceChrome } from '../surface.ts';
import { renderTooltip, tooltipAccessibleBase } from '../tooltip.ts';
import { placeAnchoredSurface } from '../../../interaction/anchored-surface.ts';
import { tooltipPreferredSize } from '../tooltip.ts';
import { focusTarget, hasKeyboardOrInputMap } from './support/common.ts';
import { drawingMeasurements } from './drawing-measurements.ts';
import type { RendererMap } from './types.ts';

export const drawingRenderers = {
  canvas: {
    measure: drawingMeasurements.canvas,
    render: (input) => {
      renderCanvas(input);
    },
    accessibility: ({ renderNode, id, focused }) => canvasAccessibleBase(renderNode, id, focused),
    focusTargets: ({ renderNode, bounds }) => hasKeyboardOrInputMap(renderNode) ? [focusTarget(bounds)] : []
  },
  surface: {
    measure: drawingMeasurements.surface,
    layout: ({ renderNode, bounds }) => surfaceChildBounds(renderNode, bounds),
    render: (input) => {
      drawSurfaceChrome(input.buffer, input.layoutNode.bounds, input.renderNode, input.theme, input.focus);
      input.renderChildren();
    },
    accessibility: ({ renderNode, id, focused }) => surfaceAccessibleBase(renderNode, id, focused)
  },
  absolute: {
    measure: drawingMeasurements.absolute,
    layout: ({ renderNode, bounds }) => absoluteChildBounds(renderNode, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  overlay: {
    measure: drawingMeasurements.overlay,
    layout: ({ renderNode, bounds }) => overlayChildBounds(renderNode, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => overlayAccessibleBase(id, focused)
  },
  divider: {
    measure: drawingMeasurements.divider,
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      renderDivider(renderNode, buffer, layoutNode.bounds, theme);
    },
    accessibility: ({ renderNode, id, focused }) => dividerAccessibleBase(renderNode, id, focused)
  },
  tooltip: {
    measure: drawingMeasurements.tooltip,
    place: ({ renderNode, viewport, widthProfile }) => renderNode.props.presentation.kind === 'hidden'
      ? { row: viewport.row, column: viewport.column, width: 0, height: 0 }
      : placeAnchoredSurface({
          viewport,
          anchor: renderNode.props.presentation.anchor,
          size: tooltipPreferredSize(renderNode, widthProfile),
          ...(renderNode.props.placement === undefined ? {} : { placement: renderNode.props.placement })
        }),
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      if (renderNode.props.presentation.kind === 'visible') {
        renderTooltip(renderNode, buffer, layoutNode.bounds, theme);
      }
    },
    accessibility: ({ renderNode, id, focused }) => tooltipAccessibleBase(renderNode, id, focused)
  }
} satisfies RendererMap<'canvas' | 'surface' | 'absolute' | 'overlay' | 'divider' | 'tooltip'>;
