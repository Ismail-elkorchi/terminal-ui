import { isNonArrayObject } from '../foundation/validation.ts';
import type { RasterImageDescriptor } from './raster-image.ts';

export interface GraphicsBudgetLimits {
  readonly sourcePixels: number;
  readonly sourceBytes: number;
  readonly cellPixelWidth: number;
  readonly cellPixelHeight: number;
  readonly fittedPixels: number;
  readonly encodedBytesPerUpload: number;
  readonly encodedBytesPerCommit: number;
  readonly placementsPerFrame: number;
  readonly liveResources: number;
}

export const defaultGraphicsBudgetLimits: GraphicsBudgetLimits = canonicalLimits({
  sourcePixels: 16_777_216,
  sourceBytes: 67_108_864,
  cellPixelWidth: 512,
  cellPixelHeight: 512,
  fittedPixels: 16_777_216,
  encodedBytesPerUpload: 33_554_432,
  encodedBytesPerCommit: 67_108_864,
  placementsPerFrame: 4_096,
  liveResources: 1_024,
});

const canonicalGraphicsBudgetLimits = new WeakSet<object>([defaultGraphicsBudgetLimits]);

export class GraphicsBudgetExceededError extends RangeError {
  readonly resource: keyof GraphicsBudgetLimits;
  readonly limit: number;
  readonly requested: number;

  constructor(resource: keyof GraphicsBudgetLimits, limit: number, requested: number) {
    super(`Graphics budget exceeded ${resource} limit of ${String(limit)} (requested ${String(requested)}).`);
    this.name = 'GraphicsBudgetExceededError';
    this.resource = resource;
    this.limit = limit;
    this.requested = requested;
  }
}

export interface GraphicsBudget {
  readonly limits: GraphicsBudgetLimits;
  admitSource(image: RasterImageDescriptor): void;
  admitCellPixels(cellPixels: { readonly width: number; readonly height: number }): void;
  admitFittedPixels(width: number, height: number): void;
  addPlacement(count?: number): void;
  assertUploadBytes(bytes: number): void;
  addCommitBytes(bytes: number): void;
  admitLiveResources(count: number): void;
}

export function normalizeGraphicsBudgetLimits(value?: unknown): GraphicsBudgetLimits {
  if (value === undefined) return defaultGraphicsBudgetLimits;
  if (typeof value === 'object' && value !== null && canonicalGraphicsBudgetLimits.has(value)) {
    return value as GraphicsBudgetLimits;
  }
  if (!isNonArrayObject(value)) throw new TypeError('Graphics budget limits must be an object.');
  const limits = { ...defaultGraphicsBudgetLimits };
  for (const field of Object.keys(defaultGraphicsBudgetLimits) as readonly (keyof GraphicsBudgetLimits)[]) {
    const candidate = value[field];
    if (candidate === undefined) continue;
    limits[field] = positiveSafeInteger(candidate, `Graphics budget ${field}`);
  }
  const canonical = canonicalLimits(limits);
  canonicalGraphicsBudgetLimits.add(canonical);
  return canonical;
}

export function createGraphicsBudget(value?: unknown): GraphicsBudget {
  const limits = normalizeGraphicsBudgetLimits(value);
  let placements = 0;
  let commitBytes = 0;
  return Object.freeze({
    limits,
    admitSource(image: RasterImageDescriptor) {
      const pixels = safeProduct(image.width, image.height, 'sourcePixels', limits.sourcePixels);
      assertWithin('sourcePixels', pixels, limits.sourcePixels);
      assertWithin('sourceBytes', image.byteLength, limits.sourceBytes);
    },
    admitCellPixels(cellPixels: { readonly width: number; readonly height: number }) {
      assertPositiveSafeInteger(cellPixels.width, 'cellPixelWidth', limits.cellPixelWidth);
      assertPositiveSafeInteger(cellPixels.height, 'cellPixelHeight', limits.cellPixelHeight);
    },
    admitFittedPixels(width: number, height: number) {
      const pixels = safeProduct(width, height, 'fittedPixels', limits.fittedPixels);
      assertWithin('fittedPixels', pixels, limits.fittedPixels);
    },
    addPlacement(count = 1) {
      placements = safeSum(placements, count, 'placementsPerFrame', limits.placementsPerFrame);
      assertWithin('placementsPerFrame', placements, limits.placementsPerFrame);
    },
    assertUploadBytes(bytes: number) {
      assertPositiveOrZeroSafeInteger(bytes, 'encodedBytesPerUpload', limits.encodedBytesPerUpload);
      assertWithin('encodedBytesPerUpload', bytes, limits.encodedBytesPerUpload);
    },
    addCommitBytes(bytes: number) {
      commitBytes = safeSum(commitBytes, bytes, 'encodedBytesPerCommit', limits.encodedBytesPerCommit);
      assertWithin('encodedBytesPerCommit', commitBytes, limits.encodedBytesPerCommit);
    },
    admitLiveResources(count: number) {
      assertPositiveOrZeroSafeInteger(count, 'liveResources', limits.liveResources);
      assertWithin('liveResources', count, limits.liveResources);
    },
  });
}

function canonicalLimits(limits: GraphicsBudgetLimits): GraphicsBudgetLimits {
  return Object.freeze({ ...limits });
}

function positiveSafeInteger(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
  return value;
}

function assertPositiveSafeInteger(
  value: number,
  resource: keyof GraphicsBudgetLimits,
  limit: number,
): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new GraphicsBudgetExceededError(resource, limit, value);
  assertWithin(resource, value, limit);
}

function assertPositiveOrZeroSafeInteger(
  value: number,
  resource: keyof GraphicsBudgetLimits,
  limit: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new GraphicsBudgetExceededError(resource, limit, value);
}

function safeProduct(
  left: number,
  right: number,
  resource: keyof GraphicsBudgetLimits,
  limit: number,
): number {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0) {
    throw new GraphicsBudgetExceededError(resource, limit, Number.POSITIVE_INFINITY);
  }
  if (left !== 0 && right > Math.floor(limit / left)) {
    throw new GraphicsBudgetExceededError(resource, limit, left * right);
  }
  return left * right;
}

function safeSum(
  current: number,
  addition: number,
  resource: keyof GraphicsBudgetLimits,
  limit: number,
): number {
  assertPositiveOrZeroSafeInteger(addition, resource, limit);
  if (addition > limit - current) throw new GraphicsBudgetExceededError(resource, limit, current + addition);
  return current + addition;
}

function assertWithin(resource: keyof GraphicsBudgetLimits, value: number, limit: number): void {
  if (value > limit) throw new GraphicsBudgetExceededError(resource, limit, value);
}
