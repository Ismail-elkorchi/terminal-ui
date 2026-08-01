import { borderStyleFromValue } from '../border.ts';
import { finiteNonNegativeIntegerOrZero } from '../../../foundation/validation.ts';
import {
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measurement,
  measureSize,
  measureText,
  zeroMeasurement
} from '../measurement.ts';
import { layoutInsetSize } from '../layout-geometry.ts';
import { numberProp } from '../render-node-props.ts';
import { tabsHeaderText } from './support/tabs.ts';
import { childMeasurements } from './measurement-support.ts';
import { flowGeometry } from './support/flow.ts';
import type { RendererMeasurementMap } from './types.ts';

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
  tabs: ({ renderNode, theme, widthProfile, childCount, measureChild }) => {
    const header = measureText(tabsHeaderText(renderNode, theme, widthProfile), { widthProfile });
    const panel = combineMeasurementsOverlay(childMeasurements(childCount, measureChild));
    return measureSize(
      Math.max(header.preferredWidth, panel.preferredWidth),
      1 + panel.preferredHeight
    );
  },
  dialog: ({ renderNode, childCount, measureChild }) => {
    const explicitWidth = numberProp(renderNode, 'width');
    const explicitHeight = numberProp(renderNode, 'height');
    const measures = childMeasurements(childCount, measureChild);
    const body = measures[0] ?? zeroMeasurement();
    const actions = measures[1];
    const contentWidth = Math.max(body.preferredWidth, actions?.preferredWidth ?? 0);
    const contentHeight = body.preferredHeight + (actions === undefined ? 0 : actions.preferredHeight + 1);
    const border = borderStyleFromValue(renderNode.props.border) ?? { kind: 'single' as const };
    const insetCells = border.kind === 'none' ? 0 : 2;
    const padding = layoutInsetSize(renderNode.props.padding);
    const shadowCells = 1;
    const minWidth = Math.max(
      5,
      finiteNonNegativeIntegerOrZero(renderNode.props.minWidth)
    );
    const minHeight = Math.max(
      4,
      finiteNonNegativeIntegerOrZero(renderNode.props.minHeight)
    );
    const maxWidth = renderNode.props.maxWidth === undefined
      ? undefined
      : Math.max(minWidth, finiteNonNegativeIntegerOrZero(renderNode.props.maxWidth));
    const maxHeight = renderNode.props.maxHeight === undefined
      ? undefined
      : Math.max(minHeight, finiteNonNegativeIntegerOrZero(renderNode.props.maxHeight));
    return measurement({
      minWidth,
      minHeight,
      preferredWidth: explicitWidth ?? Math.max(
        minWidth,
        contentWidth + padding.width + insetCells + shadowCells
      ),
      preferredHeight: explicitHeight ?? Math.max(
        minHeight,
        contentHeight + padding.height + insetCells + shadowCells
      ),
      ...(maxWidth === undefined ? {} : { maxWidth }),
      ...(maxHeight === undefined ? {} : { maxHeight })
    });
  }
} satisfies RendererMeasurementMap<'row' | 'column' | 'flow' | 'measuredColumn' | 'viewport' | 'grid' | 'splitPane' | 'tabs' | 'dialog'>;
