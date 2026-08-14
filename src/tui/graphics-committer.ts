import {
  encodeKittyImageDelete,
  encodeKittyImageUpload,
  encodeKittyPlacement,
  encodeKittyPlacementDelete,
  encodeSixelImage,
  resolveGraphicGeometry,
} from '../protocol/index.ts';
import type { TerminalGraphicsTransport } from '../protocol/index.ts';
import type { GraphicPlacement, RasterImage, TerminalGraphicsMode } from '../graphics/index.ts';
import type { TerminalCapabilityProfile } from '../host/index.ts';
import type { TerminalTheme, ThemeColor } from '../theme/index.ts';
import type { Frame, RenderDiff } from '../renderer/contracts.ts';

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
      readonly imageId: number;
      readonly protocolId: number;
    }
  | {
      readonly protocol: 'sixel';
      readonly placement: GraphicPlacement;
    };

export interface TerminalGraphicsCommitter {
  plan(frame: Frame, diff: RenderDiff, capabilities: TerminalCapabilityProfile, theme: TerminalTheme): GraphicsCommitPlan;
  invalidate(): void;
  cleanup(): string;
}

export function createTerminalGraphicsCommitter(mode: TerminalGraphicsMode): TerminalGraphicsCommitter {
  let active: 'kitty' | 'sixel' | undefined;
  let transport: TerminalGraphicsTransport = 'direct';
  let nextImageId = randomProtocolId();
  let nextPlacementId = randomProtocolId();
  const images = new Map<RasterImage, number>();
  const placements = new Map<string, PlacementState>();
  let baselineKnown = true;
  let renderProfile: string | undefined;

  return {
    plan(frame, diff, capabilities, theme) {
      const resolved = resolveProtocol(mode, capabilities);
      const nextRenderProfile = graphicsRenderProfile(resolved, capabilities, theme);
      if (nextRenderProfile !== renderProfile || !baselineKnown) {
        const cleanup = kittyCleanup(active, transport, images, placements);
        active = resolved?.protocol;
        transport = resolved?.transport ?? 'direct';
        renderProfile = nextRenderProfile;
        images.clear();
        placements.clear();
        nextImageId = randomProtocolId();
        nextPlacementId = randomProtocolId();
        baselineKnown = true;
        if (active === undefined) {
          return Object.freeze({ forceFullRewrite: cleanup.length > 0, beforeCells: cleanup, afterCells: '' });
        }
        const fresh = active === 'kitty'
          ? planKitty(frame.graphics, true, capabilities.graphics.cellPixels)
          : planSixel(frame.graphics, true, capabilities, theme);
        return Object.freeze({
          forceFullRewrite: true,
          beforeCells: `${cleanup}${fresh.beforeCells}`,
          afterCells: fresh.afterCells,
        });
      }
      if (active === undefined) return emptyPlan;
      return active === 'kitty'
        ? planKitty(frame.graphics, false, capabilities.graphics.cellPixels)
        : planSixel(frame.graphics, diff.operations.length > 0, capabilities, theme);
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
      baselineKnown = true;
      return output;
    },
  };

  function planKitty(
    desired: readonly GraphicPlacement[],
    force: boolean,
    cellPixels: TerminalCapabilityProfile['graphics']['cellPixels'],
  ): GraphicsCommitPlan {
    const desiredById = new Map(desired.map((placement) => [placement.id, placement]));
    const changed = force
      || [...placements].some(([id, state]) => {
        const next = desiredById.get(id);
        return next === undefined || !samePlacement(state.placement, next);
      });
    let beforeCells = '';
    if (changed) {
      for (const state of placements.values()) {
        if (state.protocol !== 'kitty') continue;
        beforeCells += encodeKittyPlacementDelete(state.imageId, state.protocolId, transport);
      }
      placements.clear();
    }
    const pending = changed
      ? desired
      : desired.filter((placement) => !placements.has(placement.id));
    let afterCells = '';
    for (const placement of pending) {
      const geometry = resolveGraphicGeometry(placement, cellPixels);
      if (geometry === undefined) continue;
      let imageId = images.get(placement.image);
      if (imageId === undefined) {
        imageId = nextImageId;
        nextImageId = incrementProtocolId(nextImageId);
        images.set(placement.image, imageId);
        afterCells += encodeKittyImageUpload(placement.image, imageId, transport);
      }
      const placementId = nextPlacementId;
      nextPlacementId = incrementProtocolId(nextPlacementId);
      afterCells += blankRect(placement.clip);
      afterCells += encodeKittyPlacement(imageId, placementId, geometry, transport);
      placements.set(placement.id, { protocol: 'kitty', placement, imageId, protocolId: placementId });
    }
    const liveImages = new Set([...placements.values()].map((state) => state.placement.image));
    for (const [image, imageId] of [...images]) {
      if (liveImages.has(image)) continue;
      beforeCells += encodeKittyImageDelete(imageId, transport);
      images.delete(image);
    }
    return Object.freeze({ forceFullRewrite: changed, beforeCells, afterCells });
  }

  function planSixel(
    desired: readonly GraphicPlacement[],
    cellsChanged: boolean,
    capabilities: TerminalCapabilityProfile,
    theme: TerminalTheme,
  ): GraphicsCommitPlan {
    const prior = [...placements.values()].map((state) => state.placement);
    const changed = !samePlacementSet(prior, desired);
    placements.clear();
    for (const placement of desired) {
      placements.set(placement.id, { protocol: 'sixel', placement });
    }
    const forceFullRewrite = changed && prior.length > 0;
    if (!changed && !cellsChanged) return emptyPlan;
    const cellPixels = capabilities.graphics.cellPixels;
    if (cellPixels === undefined) return emptyPlan;
    let afterCells = '';
    const background = backgroundColor(theme.tokens.colors['app.background']);
    for (const placement of desired) {
      const geometry = resolveGraphicGeometry(placement, cellPixels);
      if (geometry === undefined) continue;
      afterCells += blankRect(placement.clip);
      afterCells += encodeSixelImage(placement.image, geometry, cellPixels, background, transport);
    }
    return Object.freeze({
      forceFullRewrite,
      beforeCells: forceFullRewrite ? `${ESC}[2J${ESC}[H` : '',
      afterCells,
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
  images: ReadonlyMap<RasterImage, number>,
  placements: ReadonlyMap<string, PlacementState>,
): string {
  if (active !== 'kitty') return active === 'sixel' && placements.size > 0 ? `${ESC}[2J${ESC}[H` : '';
  return [
    ...[...placements.values()].flatMap((state) => state.protocol === 'kitty'
      ? [encodeKittyPlacementDelete(state.imageId, state.protocolId, transport)]
      : []),
    ...[...images.values()].map((id) => encodeKittyImageDelete(id, transport)),
  ].join('');
}

function blankRect(rect: GraphicPlacement['bounds']): string {
  const lines: string[] = [`${ESC}[0m`];
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    lines.push(`${ESC}[${String(row)};${String(rect.column)}H${' '.repeat(rect.width)}`);
  }
  return lines.join('');
}

function samePlacementSet(left: readonly GraphicPlacement[], right: readonly GraphicPlacement[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((placement) => [placement.id, placement]));
  return left.every((placement) => {
    const candidate = rightById.get(placement.id);
    return candidate !== undefined && samePlacement(placement, candidate);
  });
}

function samePlacement(left: GraphicPlacement, right: GraphicPlacement): boolean {
  return left.image === right.image
    && left.fit === right.fit
    && rectKey(left.bounds) === rectKey(right.bounds)
    && rectKey(left.clip) === rectKey(right.clip);
}

function rectKey(rect: GraphicPlacement['bounds']): string {
  return `${String(rect.row)}:${String(rect.column)}:${String(rect.width)}:${String(rect.height)}`;
}

function backgroundColor(color: ThemeColor | undefined):
  { readonly r: number; readonly g: number; readonly b: number } | undefined {
  return color?.kind === 'rgb' ? { r: color.r, g: color.g, b: color.b } : undefined;
}
