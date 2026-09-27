import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { DividerStylePart } from '../style-parts.ts';
import type { DividerLineKind, DividerOrientation } from './contracts.ts';


export interface DividerOptions {
  readonly id?: string;
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
  readonly styles?: import('../../element/metadata.ts').ElementStyles<DividerStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}
