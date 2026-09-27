import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { FieldStylePart, LabelStylePart } from '../style-parts.ts';


export interface FormOptions<
  TContent extends readonly Element<ComponentMessage>[] = readonly Element<ComponentMessage>[],
> extends LayoutFlowOptions {
  readonly id?: string;
  readonly title?: string;
  readonly slots: { readonly content: TContent };
  readonly onTransition?: never;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<'title'>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface FieldOptions<
  TChild extends import('../../element/index.ts').Element<ComponentMessage>
> extends LayoutFlowOptions {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly control: TChild;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<FieldStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export interface LabelOptions {
  readonly id: string;
  readonly text: string;
  readonly forId: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<LabelStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}
