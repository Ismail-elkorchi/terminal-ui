import { isNonArrayObject } from '../../foundation/validation.ts';
import { createGraphicsBudget } from '../../graphics/index.ts';
import type { GraphicsBudget } from '../../graphics/index.ts';

export interface RenderBudgetLimits {
  readonly nodes: number;
  readonly depth: number;
  readonly measurements: number;
  readonly regions: number;
  readonly hitTargets: number;
  readonly accessibilityNodes: number;
  readonly accessibilityRelationships: number;
}

export const defaultRenderBudgetLimits: RenderBudgetLimits = Object.freeze({
  nodes: 100_000,
  depth: 256,
  measurements: 200_000,
  regions: 4_096,
  hitTargets: 100_000,
  accessibilityNodes: 100_000,
  accessibilityRelationships: 400_000,
});

export interface RenderBudget {
  readonly limits: RenderBudgetLimits;
  readonly graphicsLimits: GraphicsBudget['limits'];
  visitNode(depth: number): void;
  measureNode(depth: number): void;
  addRegions(count?: number): void;
  addHitTargets(count: number): void;
  addAccessibilityNode(depth: number, relationships: number): void;
  addAccessibilityRelationships(count: number): void;
  addGraphicsPlacements(count: number): void;
  nodeCount(): number;
}

export function createRenderBudget(value?: unknown, graphics = createGraphicsBudget()): RenderBudget {
  const limits = normalizeRenderBudgetLimits(value);
  const counts = {
    nodes: 0,
    measurements: 0,
    regions: 0,
    hitTargets: 0,
    accessibilityNodes: 0,
    accessibilityRelationships: 0,
  };
  return Object.freeze({
    limits,
    graphicsLimits: graphics.limits,
    visitNode(depth: number) {
      assertDepth(depth, limits);
      add('nodes', 1, limits.nodes);
    },
    measureNode(depth: number) {
      assertDepth(depth, limits);
      add('measurements', 1, limits.measurements);
    },
    addRegions(count = 1) {
      add('regions', count, limits.regions);
    },
    addHitTargets(count: number) {
      add('hitTargets', count, limits.hitTargets);
    },
    addAccessibilityNode(depth: number, relationships: number) {
      assertDepth(depth, limits);
      add('accessibilityNodes', 1, limits.accessibilityNodes);
      add('accessibilityRelationships', relationships, limits.accessibilityRelationships);
    },
    addAccessibilityRelationships(count: number) {
      add('accessibilityRelationships', count, limits.accessibilityRelationships);
    },
    addGraphicsPlacements(count: number) {
      graphics.addPlacement(count);
    },
    nodeCount: () => counts.nodes,
  });

  function add(field: keyof typeof counts, count: number, limit: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Render budget ${field} increment must be a non-negative safe integer.`);
    }
    counts[field] += count;
    if (counts[field] > limit) {
      throw new RangeError(`Render budget exceeded ${field} limit of ${String(limit)}.`);
    }
  }
}

function normalizeRenderBudgetLimits(value: unknown): RenderBudgetLimits {
  if (value === undefined) return defaultRenderBudgetLimits;
  if (!isNonArrayObject(value)) throw new TypeError('Render budget limits must be an object.');
  const fields = Object.keys(defaultRenderBudgetLimits) as readonly (keyof RenderBudgetLimits)[];
  const limits = { ...defaultRenderBudgetLimits };
  for (const field of fields) {
    const candidate = value[field];
    if (candidate === undefined) continue;
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 1) {
      throw new RangeError(`Render budget ${field} must be a positive safe integer.`);
    }
    limits[field] = candidate;
  }
  return Object.freeze(limits);
}

function assertDepth(depth: number, limits: RenderBudgetLimits): void {
  if (!Number.isSafeInteger(depth) || depth < 0 || depth > limits.depth) {
    throw new RangeError(`Render budget exceeded depth limit of ${String(limits.depth)}.`);
  }
}
