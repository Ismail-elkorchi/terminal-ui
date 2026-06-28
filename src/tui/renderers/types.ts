import type { WidgetKind } from '../../widgets/index.ts';
import type { WidgetRenderer } from '../widget-renderer.ts';

export type BuiltinWidgetKind = Exclude<WidgetKind, 'custom'>;

export type RendererMap<K extends BuiltinWidgetKind> = Readonly<Record<K, WidgetRenderer>>;
