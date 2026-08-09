import { finiteNonNegativeIntegerOrZero } from '../../../foundation/validation.ts';
import {
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measureSize
} from '../measurement.ts';
import { numberProp } from '../render-node-props.ts';
import { childMeasurements } from './measurement-support.ts';
import { flowGeometry } from './support/flow.ts';
import type { StructuralMeasurementMap } from './types.ts';

export const layoutMeasurements = {
  row: ({ renderNode, childCount, measureChild }) => combineMeasurementsHorizontally(
    childMeasurements(childCount, measureChild),
    finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'gap'))
  ),
  column: ({ renderNode, childCount, measureChild }) => combineMeasurementsVertically(
    childMeasurements(childCount, measureChild),
    finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'gap'))
  ),
  flow: ({ renderNode, bounds, childCount, measureChild }) => {
    const children = childMeasurements(childCount, measureChild);
    const geometry = flowGeometry(
      renderNode.props.direction,
      renderNode.props.direction === 'horizontal' ? bounds.width : bounds.height,
      finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'gap')),
      finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'lineGap')),
      children
    );
    return measureSize(
      geometry.width,
      geometry.height,
      children.reduce((maximum, child) => Math.max(maximum, child.minWidth), 0),
      children.reduce((maximum, child) => Math.max(maximum, child.minHeight), 0)
    );
  },
  measuredColumn: ({ renderNode, childCount, measureChild }) => {
    const children = childMeasurements(childCount, measureChild);
    const preferredWidth = children.reduce(
      (largest, child) => Math.max(largest, child.preferredWidth),
      0
    );
    return measureSize(preferredWidth, renderNode.props.viewportRows);
  },
  viewport: ({ childCount, measureChild }) =>
    combineMeasurementsOverlay(childMeasurements(childCount, measureChild)),
  grid: ({ childCount, measureChild }) => combineMeasurementsOverlay(childMeasurements(childCount, measureChild)),
  splitPane: ({ childCount, measureChild }) => combineMeasurementsOverlay(childMeasurements(childCount, measureChild)),
} satisfies StructuralMeasurementMap<'row' | 'column' | 'flow' | 'measuredColumn' | 'viewport' | 'grid' | 'splitPane'>;
