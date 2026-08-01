import type {
  AccessibilityOptions,
  AccessibleNode
} from '../../accessibility/index.ts';
import type { ElementMeta } from '../../element/metadata.ts';
import type {
  CanvasPainter,
  Measurement
} from '../../renderer/contracts.ts';
import type { CanvasStylePart } from '../../ui-model/style-parts.ts';

type SemanticCanvasMeta =
  Omit<ElementMeta<CanvasStylePart>, 'accessibility'> & {
    readonly accessibility?:
      | AccessibleNode
      | (AccessibilityOptions & { readonly decorative?: false });
  };

type DecorativeCanvasMeta =
  Omit<ElementMeta<CanvasStylePart>, 'accessibility' | 'focus'> & {
    readonly accessibility: AccessibilityOptions & {
      readonly decorative: true;
    };
    readonly focus?: never;
  };

interface CanvasOptionsBase {
  readonly id?: string;
  readonly painter: CanvasPainter;
  readonly measurement: Measurement;
}

export interface SemanticCanvasOptions extends CanvasOptionsBase {
  readonly label: string;
  readonly meta?: SemanticCanvasMeta;
}

export interface DecorativeCanvasOptions extends CanvasOptionsBase {
  readonly label?: never;
  readonly meta: DecorativeCanvasMeta;
}

export type CanvasOptions =
  | SemanticCanvasOptions
  | DecorativeCanvasOptions;

export type {
  CanvasPainter,
  CanvasPainterInput
} from '../../renderer/contracts.ts';
