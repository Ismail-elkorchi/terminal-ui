import { drawingRenderers } from './drawing-renderers.ts';
import { layoutRenderers } from './layout-renderers.ts';
import type { StructuralNodeRenderer, StructuralRenderNodeKind } from './types.ts';

type StructuralRendererRegistry = {
  readonly [TKind in StructuralRenderNodeKind]: StructuralNodeRenderer<TKind>;
};

export const structuralNodeRenderers: StructuralRendererRegistry = {
  ...drawingRenderers,
  ...layoutRenderers
};
