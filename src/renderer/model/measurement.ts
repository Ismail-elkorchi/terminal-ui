export interface Measurement {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly preferredWidth: number;
  readonly preferredHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface MeasurementInput {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly preferredWidth: number;
  readonly preferredHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}
