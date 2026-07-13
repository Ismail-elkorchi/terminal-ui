import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings, InteractiveElementOptions } from '../../element/metadata.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { DialogStylePart } from '../../ui-model/style-parts.ts';
import type { BorderStyle } from '../../visual/border.ts';

export interface DialogOptions<TMessage = never> extends InteractiveElementOptions<DialogStylePart>, LayoutFlowOptions {
  readonly title?: string;
  readonly border?: BorderStyle;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Element<TMessage>;
  readonly keys?: ElementKeyBindings<TMessage>;
}
