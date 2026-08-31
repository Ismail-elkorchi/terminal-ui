import {
  encodeKittyDirectPlacement,
  encodeKittyImageDelete,
  encodeKittyImageUpload,
  encodeKittyPlacementDelete,
  encodeKittyUnicodePlaceholder,
  encodeKittyVirtualPlacement,
  encodeSixelImage,
  resolveGraphicGeometry,
} from '../protocol/index.ts';
import type { KittyGraphicsTransport, ResolvedGraphicGeometry } from '../protocol/index.ts';
import { kittyPlaceholderDimension } from '../protocol/kitty-placeholder-diacritics.ts';
import { resampleRasterRegion } from '../protocol/raster-resampling.ts';
import {
  createGraphicsBudget,
  GraphicsBudgetExceededError,
  resolveGraphicsBudgetLimits,
} from '../graphics/index.ts';
import type {
  GraphicPlacement,
  GraphicsBudget,
  GraphicsBudgetLimits,
  RasterImage,
  TerminalGraphicsMode,
} from '../graphics/index.ts';
import type { TerminalCapabilityProfile } from '../host/index.ts';
import type { TerminalTheme, ThemeColor } from '../theme/index.ts';
import type { Frame, RenderDiff } from '../renderer/contracts.ts';
import type { Rect } from '../renderer/contracts.ts';
import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import { rasterImageResourceKey } from '../graphics/raster-image.ts';
import { measureRenderSpans } from '../renderer/index.ts';

const ESC = '\u001b';

export interface GraphicsCommitPlan {
  readonly forceFullRewrite: boolean;
  readonly beforeCells: string;
  readonly afterCells: string;
}

type PlacementState =
  | {
      readonly protocol: 'kitty';
      readonly placement: GraphicPlacement;
      readonly renderings: readonly KittyPlacementRendering[];
    }
  | {
      readonly protocol: 'sixel';
      readonly placement: GraphicPlacement;
      readonly encodingKey: string;
    };

interface KittyImageResource {
  readonly key: string;
  readonly image: RasterImage;
  readonly imageId: number;
  readonly references: number;
}

interface KittyPlacementRendering {
  readonly protocolId: number;
  readonly resourceKey: string;
  readonly imageId: number;
  readonly geometry: ResolvedGraphicGeometry;
}

export interface TerminalGraphicsCommitter {
  plan(frame: Frame, diff: RenderDiff, capabilities: TerminalCapabilityProfile, theme: TerminalTheme): GraphicsCommitPlan;
  invalidate(): void;
  cleanup(): string;
  metrics(): GraphicsCommitterMetrics;
}

export interface GraphicsCommitterMetrics {
  readonly sixelEncodes: number;
  readonly sixelCacheHits: number;
}

export function createTerminalGraphicsCommitter(
  mode: TerminalGraphicsMode,
  budgetInput?: Partial<GraphicsBudgetLimits>,
  reportDiagnostic?: (item: TerminalDiagnostic) => void,
): TerminalGraphicsCommitter {
  const budgetLimits = resolveGraphicsBudgetLimits(budgetInput);
  let active: 'kitty' | 'sixel' | undefined;
  let transport: KittyGraphicsTransport = 'direct';
  let nextImageId = randomProtocolId();
  let nextPlacementId = randomProtocolId();
  const images = new Map<string, KittyImageResource>();
  const placements = new Map<string, PlacementState>();
  const sixelCache = new Map<string, string>();
  let baselineKnown = true;
  let renderProfile: string | undefined;
  let lastBudgetFailure: string | undefined;
  let sixelEncodes = 0;
  let sixelCacheHits = 0;

  return {
    plan(frame, diff, capabilities, theme) {
      const resolved = resolveProtocol(mode, capabilities);
      const nextRenderProfile = graphicsRenderProfile(resolved, capabilities, theme, frame.height);
      const profileChanged = nextRenderProfile !== renderProfile || !baselineKnown;
      let previousCleanup = '';
      const budget = createGraphicsBudget(budgetLimits);
      try {
        if (resolved !== undefined) admitGraphicsFrame(frame.graphics, capabilities, budget);
        if (profileChanged) {
          previousCleanup = kittyCleanup(active, transport, images, placements);
          active = resolved?.protocol;
          transport = resolved?.transport ?? 'direct';
          renderProfile = nextRenderProfile;
          images.clear();
          placements.clear();
          sixelCache.clear();
          nextImageId = randomProtocolId();
          nextPlacementId = randomProtocolId();
          baselineKnown = true;
          if (active === undefined) {
            lastBudgetFailure = undefined;
            return Object.freeze({
              forceFullRewrite: previousCleanup.length > 0,
              beforeCells: previousCleanup,
              afterCells: '',
            });
          }
          const fresh = active === 'kitty'
            ? planKitty(frame.graphics, true, diff, capabilities.graphics.cellPixels, budget)
            : planSixel(frame.graphics, true, diff, capabilities, theme, frame.height, budget);
          lastBudgetFailure = undefined;
          return Object.freeze({
            forceFullRewrite: true,
            beforeCells: `${previousCleanup}${fresh.beforeCells}`,
            afterCells: fresh.afterCells,
          });
        }
        if (active === undefined) return emptyPlan;
        const plan = active === 'kitty'
          ? planKitty(frame.graphics, false, diff, capabilities.graphics.cellPixels, budget)
          : planSixel(frame.graphics, false, diff, capabilities, theme, frame.height, budget);
        lastBudgetFailure = undefined;
        return plan;
      } catch (cause) {
        if (!(cause instanceof GraphicsBudgetExceededError)) throw cause;
        if (!profileChanged) previousCleanup = kittyCleanup(active, transport, images, placements);
        active = resolved?.protocol;
        transport = resolved?.transport ?? 'direct';
        renderProfile = nextRenderProfile;
        images.clear();
        placements.clear();
        sixelCache.clear();
        baselineKnown = true;
        const failureKey = `${cause.resource}:${String(cause.limit)}:${String(cause.requested)}`;
        if (failureKey !== lastBudgetFailure) {
          lastBudgetFailure = failureKey;
          reportDiagnostic?.(diagnostic(
            'TUI_GRAPHICS_LIMIT_EXCEEDED',
            'Terminal graphics exceeded its configured resource budget; the text fallback was retained.',
            {
              severity: 'warning',
              data: {
                resource: cause.resource,
                limit: cause.limit,
                requested: Number.isFinite(cause.requested) ? cause.requested : String(cause.requested),
              },
            },
          ));
        }
        return Object.freeze({
          forceFullRewrite: true,
          beforeCells: previousCleanup,
          afterCells: '',
        });
      }
    },
    invalidate() {
      baselineKnown = false;
    },
    cleanup() {
      const output = kittyCleanup(active, transport, images, placements);
      active = undefined;
      renderProfile = undefined;
      images.clear();
      placements.clear();
      sixelCache.clear();
      baselineKnown = true;
      return output;
    },
    metrics() {
      return Object.freeze({ sixelEncodes, sixelCacheHits });
    },
  };

  function planKitty(
    desired: readonly GraphicPlacement[],
    force: boolean,
    diff: RenderDiff,
    cellPixels: TerminalCapabilityProfile['graphics']['cellPixels'],
    budget: GraphicsBudget,
  ): GraphicsCommitPlan {
    const nextImages = new Map(images);
    const nextPlacements = new Map(placements);
    let candidateImageId = nextImageId;
    let candidatePlacementId = nextPlacementId;
    const desiredById = new Map(desired.map((placement) => [placement.id, placement]));
    const changed = force
      || [...nextPlacements].some(([id, state]) => {
        const next = desiredById.get(id);
        return next === undefined || !samePlacement(state.placement, next);
      });
    let beforeCells = '';
    if (changed) {
      for (const state of nextPlacements.values()) {
        if (state.protocol !== 'kitty') continue;
        for (const rendering of state.renderings) {
          beforeCells += encodeKittyPlacementDelete(rendering.imageId, rendering.protocolId, transport, budget);
        }
      }
      nextPlacements.clear();
    }
    const pending = changed
      ? desired
      : desired.filter((placement) => !nextPlacements.has(placement.id));
    const pendingIds = new Set(pending.map((placement) => placement.id));
    let afterCells = '';
    for (const placement of pending) {
      const geometry = resolveGraphicGeometry(placement, cellPixels);
      if (geometry === undefined) continue;
      afterCells += blankRect(placement.clip, budget);
      const geometries = transport === 'direct' ? [geometry] : tileKittyPlaceholderGeometry(geometry);
      const renderings: KittyPlacementRendering[] = [];
      for (const renderingGeometry of geometries) {
        const { renderedImage, placementGeometry } = resolveKittyRendering(
          placement.image,
          renderingGeometry,
          transport,
          cellPixels,
          budget,
        );
        const resourceKey = imageResourceKey(renderedImage);
        let resource = nextImages.get(resourceKey);
        if (resource === undefined) {
          const imageId = candidateImageId;
          candidateImageId = incrementProtocolId(candidateImageId);
          resource = { key: resourceKey, image: renderedImage, imageId, references: 0 };
          nextImages.set(resourceKey, resource);
          afterCells += encodeKittyImageUpload(renderedImage, imageId, transport, budget);
        }
        const protocolId = candidatePlacementId;
        candidatePlacementId = incrementProtocolId(candidatePlacementId);
        afterCells += transport === 'direct'
          ? encodeKittyDirectPlacement(resource.imageId, protocolId, placementGeometry, budget)
          : `${encodeKittyVirtualPlacement(resource.imageId, protocolId, placementGeometry, transport, budget)}${encodeKittyUnicodePlaceholder(resource.imageId, protocolId, placementGeometry, budget)}`;
        renderings.push({
          protocolId,
          resourceKey,
          imageId: resource.imageId,
          geometry: placementGeometry,
        });
      }
      nextPlacements.set(placement.id, {
        protocol: 'kitty',
        placement,
        renderings: Object.freeze(renderings),
      });
    }
    afterCells += repaintDamagedKittyPlacements(
      desired,
      pendingIds,
      diff,
      nextPlacements,
      transport,
      budget,
    );
    const references = new Map<string, number>();
    for (const state of nextPlacements.values()) {
      if (state.protocol !== 'kitty') continue;
      for (const rendering of state.renderings) {
        references.set(rendering.resourceKey, (references.get(rendering.resourceKey) ?? 0) + 1);
      }
    }
    for (const [key, resource] of [...nextImages]) {
      const count = references.get(key) ?? 0;
      if (count > 0) {
        nextImages.set(key, { ...resource, references: count });
        continue;
      }
      beforeCells += encodeKittyImageDelete(resource.imageId, transport, budget);
      nextImages.delete(key);
    }
    budget.admitLiveResources(nextImages.size);
    replaceMap(images, nextImages);
    replaceMap(placements, nextPlacements);
    nextImageId = candidateImageId;
    nextPlacementId = candidatePlacementId;
    return Object.freeze({ forceFullRewrite: changed, beforeCells, afterCells });
  }

  function planSixel(
    desired: readonly GraphicPlacement[],
    force: boolean,
    diff: RenderDiff,
    capabilities: TerminalCapabilityProfile,
    theme: TerminalTheme,
    terminalRows: number,
    budget: GraphicsBudget,
  ): GraphicsCommitPlan {
    const prior = [...placements.values()].map((state) => state.placement);
    const priorById = new Map(prior.map((placement) => [placement.id, placement]));
    const desiredById = new Map(desired.map((placement) => [placement.id, placement]));
    const destructiveChange = prior.some((placement) => {
      const next = desiredById.get(placement.id);
      return next === undefined || !samePlacement(placement, next);
    });
    const changedIds = new Set(desired.flatMap((placement) => {
      const previous = priorById.get(placement.id);
      return previous === undefined || !samePlacement(previous, placement) ? [placement.id] : [];
    }));
    const forceFullRewrite = force || (destructiveChange && prior.length > 0);
    const cellPixels = capabilities.graphics.cellPixels;
    if (cellPixels === undefined) return emptyPlan;
    const visible = desired.flatMap((placement) => {
      const clipped = clipSixelPlacement(placement, terminalRows);
      return clipped === undefined ? [] : [clipped];
    });
    const background = backgroundColor(theme.tokens.colors['app.background']);
    const damage = forceFullRewrite
      ? visible.map((placement) => placement.clip)
      : diffDamageRects(diff);
    const repaint = repaintPlacements(visible, damage, changedIds);
    if (repaint.length === 0 && changedIds.size === 0 && !destructiveChange) return emptyPlan;
    const nextCache = new Map(sixelCache);
    const desiredEncodingKeys = new Set<string>();
    const geometries = new Map<string, ReturnType<typeof resolveGraphicGeometry>>();
    for (const placement of visible) {
      const geometry = resolveGraphicGeometry(placement, cellPixels);
      if (geometry === undefined) continue;
      geometries.set(placement.id, geometry);
      desiredEncodingKeys.add(sixelEncodingKey(placement, geometry, cellPixels, background));
    }
    const output: string[] = [];
    for (const placement of repaint) {
      const geometry = geometries.get(placement.id);
      if (geometry === undefined) continue;
      const key = sixelEncodingKey(placement, geometry, cellPixels, background);
      let encoded = nextCache.get(key);
      if (encoded === undefined) {
        encoded = encodeSixelImage(placement.image, geometry, cellPixels, background, budget);
        nextCache.set(key, encoded);
        sixelEncodes += 1;
      } else {
        budget.assertUploadBytes(encoded.length);
        budget.addCommitBytes(encoded.length);
        sixelCacheHits += 1;
      }
      output.push(blankRect(placement.clip, budget), encoded);
    }
    for (const key of nextCache.keys()) {
      if (!desiredEncodingKeys.has(key)) nextCache.delete(key);
    }
    placements.clear();
    for (const placement of desired) {
      const geometry = geometries.get(placement.id);
      if (geometry === undefined) continue;
      placements.set(placement.id, {
        protocol: 'sixel',
        placement,
        encodingKey: sixelEncodingKey(placement, geometry, cellPixels, background),
      });
    }
    replaceMap(sixelCache, nextCache);
    return Object.freeze({
      forceFullRewrite,
      beforeCells: forceFullRewrite ? `${ESC}[2J${ESC}[H` : '',
      afterCells: output.join(''),
    });
  }
}

function clipSixelPlacement(placement: GraphicPlacement, terminalRows: number): GraphicPlacement | undefined {
  const safeBottom = terminalRows;
  const height = Math.min(placement.clip.row + placement.clip.height, safeBottom) - placement.clip.row;
  if (height <= 0) return undefined;
  if (height === placement.clip.height) return placement;
  return Object.freeze({
    ...placement,
    clip: Object.freeze({ ...placement.clip, height }),
  });
}

function repaintDamagedKittyPlacements(
  desired: readonly GraphicPlacement[],
  pendingIds: ReadonlySet<string>,
  diff: RenderDiff,
  current: ReadonlyMap<string, PlacementState>,
  transport: KittyGraphicsTransport,
  budget: GraphicsBudget,
): string {
  const cellDamage = diffDamageRects(diff);
  let output = '';
  for (const placement of desired) {
    if (pendingIds.has(placement.id)) continue;
    if (!cellDamage.some((rect) => rectsIntersect(rect, placement.clip))) continue;
    output += blankRect(placement.clip, budget);
    if (transport === 'direct') continue;
    const state = current.get(placement.id);
    if (state?.protocol !== 'kitty') continue;
    for (const rendering of state.renderings) {
      output += encodeKittyUnicodePlaceholder(
        rendering.imageId,
        rendering.protocolId,
        rendering.geometry,
        budget,
      );
    }
  }
  return output;
}

const emptyPlan: GraphicsCommitPlan = Object.freeze({ forceFullRewrite: false, beforeCells: '', afterCells: '' });

function randomProtocolId(): number {
  return Math.floor(Math.random() * 0xff_ffff) + 1;
}

function incrementProtocolId(value: number): number {
  return value === 0xff_ffff ? 1 : value + 1;
}

function graphicsRenderProfile(
  resolved: ReturnType<typeof resolveProtocol>,
  capabilities: TerminalCapabilityProfile,
  theme: TerminalTheme,
  terminalRows: number,
): string | undefined {
  if (resolved === undefined) return undefined;
  const pixels = capabilities.graphics.cellPixels;
  const geometry = pixels === undefined ? 'unknown' : `${String(pixels.width)}x${String(pixels.height)}`;
  if (resolved.protocol === 'kitty') return `kitty:${resolved.transport}:${geometry}`;
  const background = backgroundColor(theme.tokens.colors['app.background']);
  const composition = background === undefined
    ? 'transparent'
    : `${String(background.r)}:${String(background.g)}:${String(background.b)}`;
  return `sixel:${geometry}:${composition}:rows=${String(terminalRows)}`;
}

function resolveProtocol(
  mode: TerminalGraphicsMode,
  capabilities: TerminalCapabilityProfile,
):
  | { readonly protocol: 'kitty'; readonly transport: KittyGraphicsTransport }
  | { readonly protocol: 'sixel'; readonly transport: 'direct' }
  | undefined {
  if (mode === 'none') return undefined;
  const kitty = capabilities.graphics.kitty.support === 'supported'
    && capabilities.graphics.kitty.availability === 'available'
    && (
      capabilities.graphics.kitty.transport !== 'tmux-passthrough'
      || capabilities.graphics.cellPixels !== undefined
    );
  const sixel = capabilities.graphics.sixel.support === 'supported'
    && capabilities.graphics.sixel.availability === 'available'
    && capabilities.graphics.cellPixels !== undefined;
  if (mode === 'kitty') {
    if (!kitty) throw new Error('Kitty graphics were required but could not be verified.');
    return { protocol: 'kitty', transport: capabilities.graphics.kitty.transport ?? 'direct' };
  }
  if (mode === 'sixel') {
    if (!sixel) throw new Error('SIXEL graphics were required but support or cell pixel geometry is unavailable.');
    return { protocol: 'sixel', transport: 'direct' };
  }
  if (kitty) return { protocol: 'kitty', transport: capabilities.graphics.kitty.transport ?? 'direct' };
  return sixel
    ? { protocol: 'sixel', transport: 'direct' }
    : undefined;
}

function kittyCleanup(
  active: 'kitty' | 'sixel' | undefined,
  transport: KittyGraphicsTransport,
  images: ReadonlyMap<string, KittyImageResource>,
  placements: ReadonlyMap<string, PlacementState>,
): string {
  if (active !== 'kitty') return active === 'sixel' && placements.size > 0 ? `${ESC}[2J${ESC}[H` : '';
  return [
    ...[...placements.values()].flatMap((state) => state.protocol === 'kitty'
      ? state.renderings.map((rendering) => encodeKittyPlacementDelete(
          rendering.imageId,
          rendering.protocolId,
          transport,
        ))
      : []),
    ...[...images.values()].map((resource) => encodeKittyImageDelete(resource.imageId, transport)),
  ].join('');
}

function blankRect(rect: GraphicPlacement['bounds'], budget: GraphicsBudget): string {
  let estimatedBytes = `${ESC}[0m`.length;
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    estimatedBytes += `${ESC}[${String(row)};${String(rect.column)}H`.length + rect.width;
  }
  budget.addCommitBytes(estimatedBytes);
  const lines: string[] = [`${ESC}[0m`];
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    lines.push(`${ESC}[${String(row)};${String(rect.column)}H${' '.repeat(rect.width)}`);
  }
  return lines.join('');
}

function tileKittyPlaceholderGeometry(
  geometry: ResolvedGraphicGeometry,
): readonly ResolvedGraphicGeometry[] {
  const tiles: ResolvedGraphicGeometry[] = [];
  const destination = geometry.destination;
  for (let rowOffset = 0; rowOffset < destination.height; rowOffset += kittyPlaceholderDimension) {
    const height = Math.min(kittyPlaceholderDimension, destination.height - rowOffset);
    for (let columnOffset = 0; columnOffset < destination.width; columnOffset += kittyPlaceholderDimension) {
      const width = Math.min(kittyPlaceholderDimension, destination.width - columnOffset);
      const tileDestination = {
        row: destination.row + rowOffset,
        column: destination.column + columnOffset,
        width,
        height,
      };
      tiles.push(Object.freeze({
        destination: Object.freeze(tileDestination),
        source: Object.freeze(cropKittyPlaceholderSource(geometry, tileDestination)),
      }));
    }
  }
  return Object.freeze(tiles);
}

function cropKittyPlaceholderSource(
  geometry: ResolvedGraphicGeometry,
  tile: ResolvedGraphicGeometry['destination'],
): ResolvedGraphicGeometry['source'] {
  const destination = geometry.destination;
  const source = geometry.source;
  const left = (tile.column - destination.column) / destination.width;
  const top = (tile.row - destination.row) / destination.height;
  const right = (tile.column + tile.width - destination.column) / destination.width;
  const bottom = (tile.row + tile.height - destination.row) / destination.height;
  const x = source.x + Math.floor(source.width * left);
  const y = source.y + Math.floor(source.height * top);
  const sourceRight = source.x + Math.ceil(source.width * right);
  const sourceBottom = source.y + Math.ceil(source.height * bottom);
  return {
    x,
    y,
    width: Math.max(1, sourceRight - x),
    height: Math.max(1, sourceBottom - y),
  };
}

function replaceMap<TKey, TValue>(target: Map<TKey, TValue>, replacement: ReadonlyMap<TKey, TValue>): void {
  target.clear();
  for (const [key, value] of replacement) target.set(key, value);
}

function admitGraphicsFrame(
  desired: readonly GraphicPlacement[],
  capabilities: TerminalCapabilityProfile,
  budget: GraphicsBudget,
): void {
  budget.addPlacement(desired.length);
  const cellPixels = capabilities.graphics.cellPixels;
  if (cellPixels !== undefined) budget.admitCellPixels(cellPixels);
  for (const placement of desired) {
    budget.admitSource(placement.image);
    if (cellPixels !== undefined) {
      const geometry = resolveGraphicGeometry(placement, cellPixels);
      if (geometry !== undefined) {
        budget.admitFittedPixels(
          geometry.destination.width * cellPixels.width,
          geometry.destination.height * cellPixels.height,
        );
      }
    }
  }
}

function fittedPlaceholderImage(
  image: RasterImage,
  geometry: ResolvedGraphicGeometry,
  cellPixels: NonNullable<TerminalCapabilityProfile['graphics']['cellPixels']>,
  budget: GraphicsBudget,
): RasterImage {
  const width = geometry.destination.width * cellPixels.width;
  const height = geometry.destination.height * cellPixels.height;
  budget.admitFittedPixels(width, height);
  return resampleRasterRegion(image, geometry.source, width, height, budget.limits);
}

function resolveKittyRendering(
  image: RasterImage,
  geometry: ResolvedGraphicGeometry,
  transport: KittyGraphicsTransport,
  cellPixels: TerminalCapabilityProfile['graphics']['cellPixels'],
  budget: GraphicsBudget,
): { readonly renderedImage: RasterImage; readonly placementGeometry: ResolvedGraphicGeometry } {
  if (transport === 'direct') return { renderedImage: image, placementGeometry: geometry };
  if (cellPixels === undefined) {
    throw new Error('Kitty Unicode placeholders require verified terminal cell pixel geometry.');
  }
  const renderedImage = fittedPlaceholderImage(image, geometry, cellPixels, budget);
  return {
    renderedImage,
    placementGeometry: geometryForFittedImage(geometry, renderedImage),
  };
}

function geometryForFittedImage(
  geometry: ResolvedGraphicGeometry,
  image: RasterImage,
): ResolvedGraphicGeometry {
  return Object.freeze({
    destination: geometry.destination,
    source: Object.freeze({ x: 0, y: 0, width: image.width, height: image.height }),
  });
}

function samePlacement(left: GraphicPlacement, right: GraphicPlacement): boolean {
  return imageResourceKey(left.image) === imageResourceKey(right.image)
    && left.fit === right.fit
    && rectKey(left.bounds) === rectKey(right.bounds)
    && rectKey(left.clip) === rectKey(right.clip);
}

function diffDamageRects(diff: RenderDiff): readonly Rect[] {
  if (diff.fullRewrite) return [{ row: 1, column: 1, width: diff.width, height: diff.height }];
  if (diff.dirtyRegions !== undefined) return diff.dirtyRegions;
  return diff.operations.flatMap((operation): readonly Rect[] => {
    if (operation.kind === 'clearRect') return [operation.bounds];
    const width = measureRenderSpans(operation.spans, { widthProfile: diff.widthProfile });
    return width === 0 ? [] : [{ row: operation.row, column: operation.column, width, height: 1 }];
  });
}

function repaintPlacements(
  desired: readonly GraphicPlacement[],
  damage: readonly Rect[],
  changedIds: ReadonlySet<string>,
): readonly GraphicPlacement[] {
  const affected = [...damage];
  const repaint: GraphicPlacement[] = [];
  for (const placement of desired) {
    if (!changedIds.has(placement.id) && !affected.some((rect) => rectsIntersect(rect, placement.clip))) continue;
    repaint.push(placement);
    affected.push(placement.clip);
  }
  return repaint;
}

function rectsIntersect(left: Rect, right: Rect): boolean {
  return left.row < right.row + right.height
    && right.row < left.row + left.height
    && left.column < right.column + right.width
    && right.column < left.column + left.width;
}

function sixelEncodingKey(
  placement: GraphicPlacement,
  geometry: NonNullable<ReturnType<typeof resolveGraphicGeometry>>,
  cellPixels: NonNullable<TerminalCapabilityProfile['graphics']['cellPixels']>,
  background: ReturnType<typeof backgroundColor>,
): string {
  return [
    imageResourceKey(placement.image),
    rectKey(geometry.destination),
    `${String(geometry.source.x)}:${String(geometry.source.y)}:${String(geometry.source.width)}:${String(geometry.source.height)}`,
    `${String(cellPixels.width)}:${String(cellPixels.height)}`,
    background === undefined
      ? 'transparent'
      : `${String(background.r)}:${String(background.g)}:${String(background.b)}`,
  ].join('|');
}

function imageResourceKey(image: RasterImage): string {
  return rasterImageResourceKey(image);
}

function rectKey(rect: GraphicPlacement['bounds']): string {
  return `${String(rect.row)}:${String(rect.column)}:${String(rect.width)}:${String(rect.height)}`;
}

function backgroundColor(color: ThemeColor | undefined):
  { readonly r: number; readonly g: number; readonly b: number } | undefined {
  return color?.kind === 'rgb' ? { r: color.r, g: color.g, b: color.b } : undefined;
}
