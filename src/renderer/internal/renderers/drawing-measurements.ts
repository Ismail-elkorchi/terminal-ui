import { finiteNonNegativeIntegerOrZero } from '../../../foundation/validation.ts';
import {
  combineMeasurementsOverlay,
  measurement,
  measureSize
} from '../measurement.ts';
import { layoutInsetSize } from '../../../geometry/layout.ts';
import { numberProp } from '../render-node-props.ts';
import { surfaceBorderForLayout } from '../surface.ts';
import { childMeasurements } from './measurement-support.ts';
import { measureTextCells } from '../../../text/index.ts';
import { borderTitleAccessibleText } from '../../../visual/border.ts';
import type { StructuralMeasurementMap } from './types.ts';

export const drawingMeasurements = {
  surface: ({ renderNode, childCount, measureChild, widthProfile }) => {
    const content = combineMeasurementsOverlay(childMeasurements(childCount, measureChild));
    const border = surfaceBorderForLayout(renderNode);
    const insetCells = border === undefined || border.kind === 'none' ? 0 : 2;
    const padding = layoutInsetSize(renderNode.props.padding);
    const margin = layoutInsetSize(renderNode.props.margin);
    const shadow = renderNode.props.shadow === true ? 1 : 0;
    const titleWidth = border === undefined || border.kind === 'none'
      ? 0
      : measureTextCells(borderTitleAccessibleText(renderNode.props.title), { widthProfile }).cells + 4;
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
        content.preferredWidth + padding.width + insetCells + shadow,
        titleWidth + shadow
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
  anchored: ({ measureChild }) => measureChild(0),
  portal: () => measureSize(0, 0),
  overlay: ({ childCount, measureChild }) => combineMeasurementsOverlay(
    childMeasurements(childCount, measureChild)
  ),
} satisfies StructuralMeasurementMap<'surface' | 'absolute' | 'anchored' | 'portal' | 'overlay'>;
