/** Host-scheduled work completes before a frame is materialized. No ambient timers. */
export interface RenderPreparationContext {
  readonly signal: AbortSignal;
  readonly yield: () => Promise<void>;
}
const preparations = new WeakMap<object, (context: RenderPreparationContext) => Promise<void>>();

export function registerRenderPreparation<T extends object>(
  model: T,
  prepare: (context: RenderPreparationContext) => Promise<void>,
): T {
  preparations.set(model, prepare);
  return model;
}

export function prepareRenderModel(model: object, context: RenderPreparationContext): Promise<void> | undefined {
  return preparations.get(model)?.(context);
}
