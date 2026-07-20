import { borderStyleFromValue } from '../border.ts';
import {
  combineMeasurementsHorizontally,
  combineMeasurementsOverlay,
  combineMeasurementsVertically,
  measureSize,
  measureText,
  zeroMeasurement
} from '../measurement.ts';
import { numberProp } from '../render-node-props.ts';
import { tabsHeaderText } from './support/tabs.ts';
import { nonNegativeInteger } from './support/common.ts';
import { childMeasurements } from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';

export const layoutMeasurements = {
  row: ({ renderNode, childCount, measureChild }) => combineMeasurementsHorizontally(
    childMeasurements(childCount, measureChild),
    nonNegativeInteger(numberProp(renderNode, 'gap'))
  ),
  column: ({ renderNode, childCount, measureChild }) => combineMeasurementsVertically(
    childMeasurements(childCount, measureChild),
    nonNegativeInteger(numberProp(renderNode, 'gap'))
  ),
  viewport: ({ renderNode, childCount, measureChild }) => {
    const content = combineMeasurementsOverlay(childMeasurements(childCount, measureChild));
    return measureSize(
      Math.max(content.preferredWidth, nonNegativeInteger(numberProp(renderNode, 'contentColumns'))),
      Math.max(content.preferredHeight, nonNegativeInteger(numberProp(renderNode, 'contentRows')))
    );
  },
  grid: ({ childCount, measureChild }) => combineMeasurementsOverlay(childMeasurements(childCount, measureChild)),
  splitPane: ({ childCount, measureChild }) => combineMeasurementsOverlay(childMeasurements(childCount, measureChild)),
  tabs: ({ renderNode, theme, widthProfile, childCount, measureChild }) => {
    const header = measureText(tabsHeaderText(renderNode, theme, widthProfile), { widthProfile });
    const panel = combineMeasurementsOverlay(childMeasurements(childCount, measureChild));
    return measureSize(
      Math.max(header.preferredWidth, panel.preferredWidth),
      header.preferredHeight + panel.preferredHeight
    );
  },
  dialog: ({ renderNode, childCount, measureChild }) => {
    const explicitWidth = numberProp(renderNode, 'width');
    const explicitHeight = numberProp(renderNode, 'height');
    if (explicitWidth !== undefined && explicitHeight !== undefined) {
      return measureSize(explicitWidth, explicitHeight, Math.min(4, explicitWidth), Math.min(3, explicitHeight));
    }
    const measures = childMeasurements(childCount, measureChild);
    const body = measures[0] ?? zeroMeasurement();
    const actions = measures[1];
    const contentWidth = Math.max(body.preferredWidth, actions?.preferredWidth ?? 0);
    const contentHeight = body.preferredHeight + (actions === undefined ? 0 : actions.preferredHeight + 1);
    const border = borderStyleFromValue(renderNode.props.border) ?? { kind: 'single' as const };
    const insetCells = border.kind === 'none' ? 0 : 2;
    return measureSize(
      explicitWidth ?? Math.max(4, contentWidth + insetCells),
      explicitHeight ?? Math.max(3, contentHeight + insetCells)
    );
  }
} satisfies RendererMeasurementMap<'row' | 'column' | 'viewport' | 'grid' | 'splitPane' | 'tabs' | 'dialog'>;
