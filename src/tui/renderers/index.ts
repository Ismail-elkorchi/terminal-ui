import { dataRenderers } from './data-renderers.ts';
import { drawingRenderers } from './drawing-renderers.ts';
import { feedbackRenderers } from './feedback-renderers.ts';
import { formRenderers } from './form-renderers.ts';
import { layoutRenderers } from './layout-renderers.ts';
import { menuRenderers } from './menu-renderers.ts';
import { textRenderers } from './text-renderers.ts';
import type { BuiltinWidgetKind } from './types.ts';
import type { WidgetRenderer } from '../widget-renderer.ts';

export const builtinWidgetRenderers = {
  ...textRenderers,
  ...feedbackRenderers,
  ...formRenderers,
  ...menuRenderers,
  ...drawingRenderers,
  ...dataRenderers,
  ...layoutRenderers
} satisfies Record<BuiltinWidgetKind, WidgetRenderer>;
