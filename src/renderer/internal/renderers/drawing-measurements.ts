import { finiteNonNegativeIntegerOrZero } from '../../../foundation/validation.ts';
import { dividerPreferredSize } from '../divider.ts';
import {
  combineMeasurementsOverlay,
  measurement,
  measureSize,
  measureText,
  zeroMeasurement
} from '../measurement.ts';
import { layoutInsetSize } from '../layout-geometry.ts';
import { numberProp, stringify } from '../render-node-props.ts';
import { tooltipPreferredSize } from '../tooltip.ts';
import { surfaceBorderForLayout } from '../surface.ts';
import { childMeasurements } from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';

export const drawingMeasurements = {
  canvas: ({ renderNode, widthProfile }) => {
    const label = stringify(renderNode.props.label);
    return label.length === 0 ? zeroMeasurement() : measureText(label, { widthProfile });
  },
  surface: ({ renderNode, childCount, measureChild }) => {
    const content = combineMeasurementsOverlay(childMeasurements(childCount, measureChild));
    const border = surfaceBorderForLayout(renderNode);
    const insetCells = border === undefined || border.kind === 'none' ? 0 : 2;
    const padding = layoutInsetSize(renderNode.props.padding);
    const margin = layoutInsetSize(renderNode.props.margin);
    const shadow = renderNode.props.shadow === true ? 1 : 0;
    const minWidth = Math.max(
      content.minWidth + padding.width + insetCells + shadow,
      finiteNonNegativeIntegerOrZero(renderNode.props.minWidth)
    );
    const minHeight = Math.max(
      content.minHeight + padding.height + insetCells + shadow,
      finiteNonNegativeIntegerOrZero(renderNode.props.minHeight)
    );
    const maxWidth = renderNode.props.maxWidth === undefined
      ? undefined
      : Math.max(minWidth, finiteNonNegativeIntegerOrZero(renderNode.props.maxWidth));
    const maxHeight = renderNode.props.maxHeight === undefined
      ? undefined
      : Math.max(minHeight, finiteNonNegativeIntegerOrZero(renderNode.props.maxHeight));
    return measurement({
      minWidth: minWidth + margin.width,
      minHeight: minHeight + margin.height,
      preferredWidth: Math.max(
        minWidth,
        content.preferredWidth + padding.width + insetCells + shadow
      ) + margin.width,
      preferredHeight: Math.max(
        minHeight,
        content.preferredHeight + padding.height + insetCells + shadow
      ) + margin.height,
      ...(maxWidth === undefined ? {} : { maxWidth: maxWidth + margin.width }),
      ...(maxHeight === undefined ? {} : { maxHeight: maxHeight + margin.height })
    });
  },
  absolute: ({ renderNode, measureChild }) => {
    const content = measureChild(0);
    const width = finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'width'));
    const height = finiteNonNegativeIntegerOrZero(numberProp(renderNode, 'height'));
    return measureSize(width || content.preferredWidth, height || content.preferredHeight);
  },
  overlay: ({ childCount, measureChild }) => combineMeasurementsOverlay(
    childMeasurements(childCount, measureChild)
  ),
  divider: ({ renderNode, widthProfile }) => {
    const preferred = dividerPreferredSize(renderNode, widthProfile);
    return measureSize(preferred.width, preferred.height);
  },
  tooltip: ({ renderNode, widthProfile }) => {
    const preferred = tooltipPreferredSize(renderNode, widthProfile);
    return measureSize(preferred.width, preferred.height);
  }
} satisfies RendererMeasurementMap<'canvas' | 'surface' | 'absolute' | 'overlay' | 'divider' | 'tooltip'>;
