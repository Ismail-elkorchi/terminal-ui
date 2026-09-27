import type { PaginationControlTransition } from '../../behavior/pagination.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { PaginationStylePart } from '../style-parts.ts';


export interface PaginationOptions<TMessage extends ComponentMessage = never> {
  readonly id: string;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly label?: string;
  readonly onTransition: (transition: PaginationControlTransition) => MessageResolution<TMessage>;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<PaginationStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}
