import type { RenderNode } from '../../model/index.ts';
import type { LayoutNode, Rect } from '../../model/layout.ts';
import type { Measurement } from '../../model/measurement.ts';

export function childMeasurements(
  childCount: number,
  measureChild: (index: number) => Measurement
): readonly Measurement[] {
  return Array.from({ length: childCount }, (_value, index) => measureChild(index));
}

export function constrainedMeasureBounds(bounds: Rect): Rect {
  return {
    row: bounds.row,
    column: bounds.column,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height)
  };
}

export function visualMeasureBounds(bounds: Rect): Rect {
  return {
    row: bounds.row,
    column: bounds.column,
    width: boundedMeasureSize(bounds.width, 40, 120),
    height: boundedMeasureSize(bounds.height, 8, 30)
  };
}

export function boundedMeasureSize(value: number, minimum: number, maximum: number): number {
  const current = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(maximum, Math.max(minimum, current));
}

export function measurementLayoutNode(renderNode: RenderNode, bounds: Rect): LayoutNode {
  return {
    ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
    kind: renderNode.kind,
    bounds,
    viewport: bounds,
    identity: renderNode.id ?? `${renderNode.kind}:0`,
    layer: {
      id: renderNode.id ?? `${renderNode.kind}:0`,
      zIndex: 0,
      bounds,
      underlay: renderNode.layer?.underlay ?? 'preserve'
    },
    visible: true,
    focusable: false,
    focusTargets: [],
    children: []
  };
}
