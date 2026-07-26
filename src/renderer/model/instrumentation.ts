export type RenderWorkKind =
  | 'normalized_records'
  | 'query_candidates'
  | 'render_nodes'
  | 'measured_nodes'
  | 'rendered_nodes'
  | 'composed_cells'
  | 'snapshot_rows'
  | 'snapshot_cells'
  | 'emitted_cells'
  | 'hit_target_candidates'
  | 'diff_rows'
  | 'diff_cells'
  | 'diff_operations'
  | 'encoded_bytes';

export interface RenderWorkMeasurement {
  readonly kind: RenderWorkKind;
  readonly count: number;
}

export interface RenderWorkInstrumentation {
  recordWork(measurement: RenderWorkMeasurement): void;
}
