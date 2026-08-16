import type { LayoutFlowOptions } from '../geometry/types.ts';
import { layoutInsetSize } from '../geometry/layout.ts';
import type { Measurement } from '../renderer/contracts.ts';
import { measurement, normalizeMeasurement } from '../renderer/measurement.ts';

/** Applies box padding, margin, and intrinsic min/max constraints to content measurement. */
export function measureConstrainedBox(
  content: Measurement,
  options: LayoutFlowOptions,
): Measurement {
  const measured = normalizeMeasurement(content);
  const padding = layoutInsetSize(options.padding);
  const margin = layoutInsetSize(options.margin);
  return measureAxisPair(
    measured,
    padding,
    margin,
    options,
  );
}

function measureAxisPair(
  content: Measurement,
  padding: { readonly width: number; readonly height: number },
  margin: { readonly width: number; readonly height: number },
  options: LayoutFlowOptions,
): Measurement {
  const width = measureAxis(
    content.minWidth,
    content.preferredWidth,
    content.maxWidth,
    padding.width,
    margin.width,
    options.minWidth,
    options.maxWidth,
  );
  const height = measureAxis(
    content.minHeight,
    content.preferredHeight,
    content.maxHeight,
    padding.height,
    margin.height,
    options.minHeight,
    options.maxHeight,
  );
  return measurement({
    minWidth: width.min,
    minHeight: height.min,
    preferredWidth: width.preferred,
    preferredHeight: height.preferred,
    ...(width.max === undefined ? {} : { maxWidth: width.max }),
    ...(height.max === undefined ? {} : { maxHeight: height.max }),
  });
}

function measureAxis(
  contentMin: number,
  contentPreferred: number,
  contentMax: number | undefined,
  padding: number,
  margin: number,
  explicitMin: number | undefined,
  explicitMax: number | undefined,
): { readonly min: number; readonly preferred: number; readonly max?: number } {
  const boxMax = explicitMax ?? (contentMax === undefined ? undefined : contentMax + padding);
  const intrinsicMin = Math.max(contentMin + padding, explicitMin ?? 0);
  const boxMin = boxMax === undefined ? intrinsicMin : Math.min(intrinsicMin, boxMax);
  const preferred = Math.max(boxMin, contentPreferred + padding);
  return {
    min: boxMin + margin,
    preferred: (boxMax === undefined ? preferred : Math.min(preferred, boxMax)) + margin,
    ...(boxMax === undefined ? {} : { max: boxMax + margin }),
  };
}
