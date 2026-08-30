import {
  encodeKittyImageDelete,
  encodeKittyImageUpload,
  encodeKittyPlacement,
  encodeKittyPlacementDelete,
  encodeSixelImage,
  resolveGraphicGeometry,
} from '../protocol/index.ts';
import type { TerminalGraphicsTransport } from '../protocol/index.ts';
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
      readonly resourceKey: string;
      readonly imageId: number;
      readonly protocolId: number;
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
  let transport: TerminalGraphicsTransport = 'direct';
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
      const nextRenderProfile = graphicsRenderProfile(resolved, capabilities, theme);
      const profileChanged = nextRenderProfile !== renderProfile || !baselineKnown;
      let previousCleanup = '';
      const budget = createGraphicsBudget(budgetLimits);
      try {
        if (resolved !== undefined) admitGraphicsFrame(frame.graphics, resolved.protocol, capabilities, budget);
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
            : planSixel(frame.graphics, true, diff, capabilities, theme, budget);
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
          : planSixel(frame.graphics, false, diff, capabilities, theme, budget);
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
        beforeCells += encodeKittyPlacementDelete(state.imageId, state.protocolId, transport, budget);
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
      const resourceKey = imageResourceKey(placement.image);
      let resource = nextImages.get(resourceKey);
      if (resource === undefined) {
        const imageId = candidateImageId;
        candidateImageId = incrementProtocolId(candidateImageId);
        resource = { key: resourceKey, image: placement.image, imageId, references: 0 };
        nextImages.set(resourceKey, resource);
        afterCells += encodeKittyImageUpload(placement.image, imageId, transport, budget);
      }
      const placementId = candidatePlacementId;
      candidatePlacementId = incrementProtocolId(candidatePlacementId);
      afterCells += blankRect(placement.clip, budget);
      afterCells += encodeKittyPlacement(resource.imageId, placementId, geometry, transport, budget);
      nextPlacements.set(placement.id, {
        protocol: 'kitty',
        placement,
        resourceKey,
        imageId: resource.imageId,
        protocolId: placementId,
      });
    }
    const cellDamage = diffDamageRects(diff);
    for (const placement of desired) {
      if (pendingIds.has(placement.id)) continue;
      if (cellDamage.some((rect) => rectsIntersect(rect, placement.clip))) {
        afterCells += blankRect(placement.clip, budget);
      }
    }
    const references = new Map<string, number>();
    for (const state of nextPlacements.values()) {
      if (state.protocol !== 'kitty') continue;
      references.set(state.resourceKey, (references.get(state.resourceKey) ?? 0) + 1);
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
    const background = backgroundColor(theme.tokens.colors['app.background']);
    const damage = forceFullRewrite
      ? desired.map((placement) => placement.clip)
      : diffDamageRects(diff);
    const repaint = repaintPlacements(desired, damage, changedIds);
    if (repaint.length === 0 && changedIds.size === 0 && !destructiveChange) return emptyPlan;
    const nextCache = new Map(sixelCache);
    const desiredEncodingKeys = new Set<string>();
    const geometries = new Map<string, ReturnType<typeof resolveGraphicGeometry>>();
    for (const placement of desired) {
      const geometry = resolveGraphicGeometry(placement, cellPixels);
      if (geometry === undefined) continue;
      geometries.set(placement.id, geometry);
      desiredEncodingKeys.add(sixelEncodingKey(placement, geometry, cellPixels, background, transport));
    }
    const output: string[] = [];
    for (const placement of repaint) {
      const geometry = geometries.get(placement.id);
      if (geometry === undefined) continue;
      const key = sixelEncodingKey(placement, geometry, cellPixels, background, transport);
      let encoded = nextCache.get(key);
      if (encoded === undefined) {
        encoded = encodeSixelImage(placement.image, geometry, cellPixels, background, transport, budget);
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
        encodingKey: sixelEncodingKey(placement, geometry, cellPixels, background, transport),
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

const emptyPlan: GraphicsCommitPlan = Object.freeze({ forceFullRewrite: false, beforeCells: '', afterCells: '' });

function randomProtocolId(): number {
  return Math.floor(Math.random() * 0xffff_ffff) + 1;
}

function incrementProtocolId(value: number): number {
  return value === 0xffff_ffff ? 1 : value + 1;
}

function graphicsRenderProfile(
  resolved: ReturnType<typeof resolveProtocol>,
  capabilities: TerminalCapabilityProfile,
  theme: TerminalTheme,
): string | undefined {
  if (resolved === undefined) return undefined;
  const pixels = capabilities.graphics.cellPixels;
  const geometry = pixels === undefined ? 'unknown' : `${String(pixels.width)}x${String(pixels.height)}`;
  if (resolved.protocol === 'kitty') return `kitty:${resolved.transport}:${geometry}`;
  const background = backgroundColor(theme.tokens.colors['app.background']);
  const composition = background === undefined
    ? 'transparent'
    : `${String(background.r)}:${String(background.g)}:${String(background.b)}`;
  return `sixel:${resolved.transport}:${geometry}:${composition}`;
}

function resolveProtocol(
  mode: TerminalGraphicsMode,
  capabilities: TerminalCapabilityProfile,
): { readonly protocol: 'kitty' | 'sixel'; readonly transport: TerminalGraphicsTransport } | undefined {
  if (mode === 'none') return undefined;
  const kitty = capabilities.graphics.kitty.support === 'supported'
    && capabilities.graphics.kitty.availability === 'available';
  const sixel = capabilities.graphics.sixel.support === 'supported'
    && capabilities.graphics.sixel.availability === 'available'
    && capabilities.graphics.cellPixels !== undefined;
  if (mode === 'kitty') {
    if (!kitty) throw new Error('Kitty graphics were required but could not be verified.');
    return { protocol: 'kitty', transport: capabilities.graphics.kitty.transport ?? 'direct' };
  }
  if (mode === 'sixel') {
    if (!sixel) throw new Error('SIXEL graphics were required but support or cell pixel geometry is unavailable.');
    return { protocol: 'sixel', transport: capabilities.graphics.sixel.transport ?? 'direct' };
  }
  if (kitty) return { protocol: 'kitty', transport: capabilities.graphics.kitty.transport ?? 'direct' };
  return sixel
    ? { protocol: 'sixel', transport: capabilities.graphics.sixel.transport ?? 'direct' }
    : undefined;
}

function kittyCleanup(
  active: 'kitty' | 'sixel' | undefined,
  transport: TerminalGraphicsTransport,
  images: ReadonlyMap<string, KittyImageResource>,
  placements: ReadonlyMap<string, PlacementState>,
): string {
  if (active !== 'kitty') return active === 'sixel' && placements.size > 0 ? `${ESC}[2J${ESC}[H` : '';
  return [
    ...[...placements.values()].flatMap((state) => state.protocol === 'kitty'
      ? [encodeKittyPlacementDelete(state.imageId, state.protocolId, transport)]
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

function replaceMap<TKey, TValue>(target: Map<TKey, TValue>, replacement: ReadonlyMap<TKey, TValue>): void {
  target.clear();
  for (const [key, value] of replacement) target.set(key, value);
}

function admitGraphicsFrame(
  desired: readonly GraphicPlacement[],
  protocol: 'kitty' | 'sixel',
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
  if (protocol === 'kitty') {
    budget.admitLiveResources(new Set(desired.map((placement) => imageResourceKey(placement.image))).size);
  }
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
  activeTransport: TerminalGraphicsTransport,
): string {
  return [
    imageResourceKey(placement.image),
    rectKey(geometry.destination),
    `${String(geometry.source.x)}:${String(geometry.source.y)}:${String(geometry.source.width)}:${String(geometry.source.height)}`,
    `${String(cellPixels.width)}:${String(cellPixels.height)}`,
    background === undefined
      ? 'transparent'
      : `${String(background.r)}:${String(background.g)}:${String(background.b)}`,
    activeTransport,
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
