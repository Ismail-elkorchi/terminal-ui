import type { Element } from '../element/types.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { Measurement } from './contracts.ts';
import type { RenderElementOptions } from './render-options.ts';
import { createRenderBudget } from './render-budget.ts';
import { createRenderEnvironment } from './internal/render-environment.ts';
import { createRenderMeasurementContext } from './internal/render-node-behavior.ts';
import { toRenderNode } from './internal/render-tree/element.ts';

/** Deliberate synchronous measurement, sharing the renderer's measurement and validation implementation. @beta */
export function measureElement(
  element: Element<unknown>,
  constraints: TerminalSize,
  options: Pick<RenderElementOptions, 'theme' | 'widthProfile' | 'limits'> = {},
): Measurement {
  const environment = createRenderEnvironment({ terminalSize: constraints, ...options });
  return createRenderMeasurementContext(environment.theme, environment.widthProfile, createRenderBudget(options.limits))
    .measure(toRenderNode(element), { row: 1, column: 1, width: constraints.columns, height: constraints.rows });
}
