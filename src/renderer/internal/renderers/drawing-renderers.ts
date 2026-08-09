import {
  absoluteAccessibleBase,
  absoluteChildBounds,
  overlayAccessibleBase,
  overlayChildBounds,
  placeSurface,
  surfaceAccessibleBase,
  surfaceChildBounds
} from '../drawing-rendering.ts';
import { drawSurface } from '../surface.ts';
import { placeAnchoredSurface } from '../../../interaction/anchored-surface.ts';
import { drawingMeasurements } from './drawing-measurements.ts';
import type { StructuralRendererMap } from './types.ts';
import type { Rect } from '../../../geometry/types.ts';
import type { HitTarget } from '../../contracts.ts';

export const drawingRenderers = {
  surface: {
    measure: drawingMeasurements.surface,
    place: ({ renderNode, bounds }) => placeSurface(renderNode, bounds),
    layout: ({ renderNode, bounds }) => surfaceChildBounds(renderNode, bounds),
    render: (input) => {
      drawSurface(input.buffer, input.layoutNode.bounds, input.renderNode, input.theme);
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => surfaceAccessibleBase(id, focused)
  },
  absolute: {
    measure: drawingMeasurements.absolute,
    layout: ({ renderNode, bounds }) => absoluteChildBounds(renderNode, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  anchored: {
    measure: drawingMeasurements.anchored,
    place: ({ renderNode, viewport, measurement }) => {
      const content = measurement();
      return placeAnchoredSurface({
        viewport,
        anchor: renderNode.props.anchor,
        size: {
          width: content.preferredWidth,
          height: content.preferredHeight
        },
        ...(renderNode.props.placement === undefined
          ? {}
          : { placement: renderNode.props.placement }),
        ...(renderNode.props.fallback === undefined
          ? {}
          : { fallback: renderNode.props.fallback }),
        ...(renderNode.props.margin === undefined
          ? {}
          : { margin: renderNode.props.margin }),
        ...(renderNode.props.fit === undefined ? {} : { fit: renderNode.props.fit })
      });
    },
    layout: ({ bounds }) => [bounds],
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  portal: {
    measure: drawingMeasurements.portal,
    place: ({ renderNode, bounds, viewport, measureChild }) => {
      const content = measureChild(0);
      if (renderNode.props.placement === 'center') {
        const margin = Math.max(0, Math.floor(renderNode.props.margin ?? 0));
        const available = {
          row: viewport.row + margin,
          column: viewport.column + margin,
          width: Math.max(0, viewport.width - margin * 2),
          height: Math.max(0, viewport.height - margin * 2)
        };
        const width = Math.min(available.width, content.preferredWidth);
        const height = Math.min(available.height, content.preferredHeight);
        return {
          row: available.row + Math.floor((available.height - height) / 2),
          column: available.column + Math.floor((available.width - width) / 2),
          width,
          height
        };
      }
      return placeAnchoredSurface({
        viewport,
        anchor: renderNode.props.anchor.kind === 'allocation'
          ? { kind: 'target', bounds }
          : renderNode.props.anchor,
        size: {
          width: content.preferredWidth,
          height: content.preferredHeight
        },
        ...(renderNode.props.placement === undefined ? {} : { placement: renderNode.props.placement }),
        ...(renderNode.props.fallback === undefined ? {} : { fallback: renderNode.props.fallback }),
        ...(renderNode.props.margin === undefined ? {} : { margin: renderNode.props.margin }),
        ...(renderNode.props.fit === undefined ? {} : { fit: renderNode.props.fit })
      });
    },
    layout: ({ bounds }) => [bounds],
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused),
    hitTargets: ({ renderNode, layoutNode }) => renderNode.props.toOutsideMessage === undefined
      ? []
      : outsidePortalTargets(
          renderNode.id ?? 'portal',
          layoutNode.viewport,
          layoutNode.bounds,
          renderNode.props.toOutsideMessage
        )
  },
  overlay: {
    measure: drawingMeasurements.overlay,
    layout: ({ renderNode, bounds }) => overlayChildBounds(renderNode, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => overlayAccessibleBase(id, focused)
  },
} satisfies StructuralRendererMap<'surface' | 'absolute' | 'anchored' | 'portal' | 'overlay'>;

function outsidePortalTargets<TMessage>(
  id: string,
  viewport: Rect,
  content: Rect,
  message: () => TMessage
): readonly HitTarget<TMessage>[] {
  const viewportEndRow = viewport.row + viewport.height;
  const viewportEndColumn = viewport.column + viewport.width;
  const contentEndRow = content.row + content.height;
  const contentEndColumn = content.column + content.width;
  const candidates = [
    {
      name: 'top',
      bounds: {
        row: viewport.row,
        column: viewport.column,
        width: viewport.width,
        height: Math.max(0, content.row - viewport.row)
      }
    },
    {
      name: 'bottom',
      bounds: {
        row: contentEndRow,
        column: viewport.column,
        width: viewport.width,
        height: Math.max(0, viewportEndRow - contentEndRow)
      }
    },
    {
      name: 'left',
      bounds: {
        row: content.row,
        column: viewport.column,
        width: Math.max(0, content.column - viewport.column),
        height: content.height
      }
    },
    {
      name: 'right',
      bounds: {
        row: content.row,
        column: contentEndColumn,
        width: Math.max(0, viewportEndColumn - contentEndColumn),
        height: content.height
      }
    }
  ] as const;
  return candidates.flatMap((candidate) => candidate.bounds.width === 0 || candidate.bounds.height === 0
    ? []
    : [{
        id: `${id}:outside:${candidate.name}`,
        bounds: candidate.bounds,
        accepts: ['click'] as const,
        message,
        zIndex: -2
      }]);
}
