import { dataRenderers } from './data-renderers.ts';
import { drawingRenderers } from './drawing-renderers.ts';
import { feedbackRenderers } from './feedback-renderers.ts';
import { formRenderers } from './form-renderers.ts';
import { layoutRenderers } from './layout-renderers.ts';
import { menuRenderers } from './menu-renderers.ts';
import { textRenderers } from './text-renderers.ts';
import type { BuiltinRenderNodeKind } from './types.ts';
import type { RenderNodeRenderer } from '../../model/renderer.ts';

type BuiltinRendererRegistry = {
  readonly [TKind in BuiltinRenderNodeKind]: RenderNodeRenderer<unknown, TKind>;
};

export const builtinRenderNodeRenderers = {
  ...textRenderers,
  ...feedbackRenderers,
  ...formRenderers,
  ...menuRenderers,
  ...drawingRenderers,
  ...dataRenderers,
  ...layoutRenderers
} satisfies BuiltinRendererRegistry;
