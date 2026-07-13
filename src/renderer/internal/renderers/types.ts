import type { RenderNodeKind } from '../../model/index.ts';
import type { RenderNodeRenderer } from '../../model/renderer.ts';

export type BuiltinRenderNodeKind = Exclude<RenderNodeKind, 'custom'>;

export type RendererMap<K extends BuiltinRenderNodeKind> = Readonly<{
  readonly [TKind in K]: RenderNodeRenderer<unknown, TKind>;
}>;
