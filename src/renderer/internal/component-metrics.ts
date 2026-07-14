import type { ComponentDensity } from '../../ui-model/contracts.ts';

export interface TableMetrics {
  readonly markerCells: number;
  readonly separatorCells: number;
}

export function resolveComponentDensity(density: ComponentDensity | undefined): ComponentDensity {
  return density ?? 'regular';
}

export function tableMetrics(density: ComponentDensity | undefined): TableMetrics {
  return resolveComponentDensity(density) === 'compact'
    ? { markerCells: 2, separatorCells: 1 }
    : { markerCells: 2, separatorCells: 2 };
}
