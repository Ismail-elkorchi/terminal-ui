import { borderStyleFromValue } from '../border.ts';
import { dividerPreferredSize } from '../divider.ts';
import {
  combineMeasurementsOverlay,
  measureSize,
  measureText,
  zeroMeasurement
} from '../measurement.ts';
import { numberProp, stringify } from '../render-node-props.ts';
import { tooltipPreferredSize } from '../tooltip.ts';
import { nonNegativeInteger } from './support/common.ts';
import { childMeasurements } from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';

export const drawingMeasurements = {
  canvas: ({ renderNode, widthProfile }) => {
    const label = stringify(renderNode.props.label);
    return label.length === 0 ? zeroMeasurement() : measureText(label, { widthProfile });
  },
  surface: ({ renderNode, childCount, measureChild }) => {
    const content = combineMeasurementsOverlay(childMeasurements(childCount, measureChild));
    const explicit = borderStyleFromValue(renderNode.props.border);
    const border = explicit ?? (
      renderNode.props.variant === undefined || renderNode.props.variant === 'neutral'
        ? { kind: 'none' as const }
        : { kind: 'single' as const }
    );
    const insetCells = border.kind === 'none' ? 0 : 2;
    return measureSize(content.preferredWidth + insetCells, content.preferredHeight + insetCells);
  },
  absolute: ({ renderNode, measureChild }) => {
    const content = measureChild(0);
    const width = nonNegativeInteger(numberProp(renderNode, 'width'));
    const height = nonNegativeInteger(numberProp(renderNode, 'height'));
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
