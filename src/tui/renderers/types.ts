import type { RenderNodeKind } from '../../render-node/index.ts';
import type { RenderNodeRenderer } from '../render-node-renderer.ts';

export type BuiltinRenderNodeKind = Exclude<RenderNodeKind, 'custom'>;

export type RendererMap<K extends BuiltinRenderNodeKind> = Readonly<{
  readonly [TKind in K]: RenderNodeRenderer<unknown, TKind>;
}>;
