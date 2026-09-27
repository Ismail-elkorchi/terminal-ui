import type {
  ChartDataStatus,
  MeterStatus,
  MeterVariant,
  ValueScale,
} from '../../behavior/visualization-data.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { MeterStylePart, SparklineStylePart } from '../style-parts.ts';


export interface SparklineOptions {
  readonly id?: string;
  readonly label: string;
  readonly values: readonly number[];
  readonly min?: number;
  readonly max?: number;
  readonly dataStatus?: ChartDataStatus;
  readonly valueScale?: ValueScale;
  readonly emptyText?: string;
  readonly loadingText?: string;
  readonly errorText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SparklineStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface MeterOptions {
  readonly id?: string;
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly width?: number;
  readonly variant?: MeterVariant;
  readonly status?: MeterStatus;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<MeterStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}
