import type { ValueScale } from '../../behavior/visualization-data.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type {
  ActivityIndicatorStylePart,
  HelpBarStylePart,
  ProgressBarStylePart,
  StatusBarStylePart,
} from '../style-parts.ts';
import type { HelpGroup } from './help.ts';
import type { ProgressBarDisplay, ProgressBarLabelPosition, ProgressBarMode } from './progress.ts';
import type { ProcessStatus, StatusBarItem } from './status-bar-contracts.ts';


export interface StatusBarOptions {
  readonly id: string;
  readonly leading?: readonly StatusBarItem[];
  readonly center?: readonly StatusBarItem[];
  readonly trailing?: readonly StatusBarItem[];
  readonly styles?: import("../../element/metadata.ts").ElementStyles<StatusBarStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface HelpBarOptions {
  readonly id: string;
  readonly groups: readonly HelpGroup[];
  readonly styles?: import("../../element/metadata.ts").ElementStyles<HelpBarStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

interface ActivityIndicatorOptionsBase {
  readonly id?: string;
  readonly label: string;
  readonly onTransition?: never;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<ActivityIndicatorStylePart>;
  readonly meta?: import('../../component/index.ts').ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface RunningActivityIndicatorOptions
  extends ActivityIndicatorOptionsBase {
  readonly status: 'running';
  readonly frames?: readonly string[];
  readonly frameIndex?: number;
}

export interface SettledActivityIndicatorOptions
  extends ActivityIndicatorOptionsBase {
  readonly status: Exclude<ProcessStatus, 'running'>;
  readonly frames?: never;
  readonly frameIndex?: never;
}

export type ActivityIndicatorOptions =
  | RunningActivityIndicatorOptions
  | SettledActivityIndicatorOptions;

export interface ProgressBarOptions {
  readonly id?: string;
  readonly label: string;
  readonly mode: ProgressBarMode;
  readonly barWidth?: number;
  readonly display?: ProgressBarDisplay;
  readonly labelPosition?: ProgressBarLabelPosition;
  readonly elapsedMs?: number;
  readonly remainingMs?: number;
  readonly status?: ProcessStatus;
  readonly valueScale?: ValueScale;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ProgressBarStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}
