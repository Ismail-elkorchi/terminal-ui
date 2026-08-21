import type {
  ElementStateStyles,
  ElementStyles,
  ElementVisualState,
} from '../element/metadata.ts';

export type ComponentStylePartMapping<TSource extends string, TTarget extends string> = Readonly<
  Record<TTarget, TSource | readonly TSource[]>
>;

/** Projects parent anatomy onto child anatomy, including each state-part matrix. */
export function mapComponentStyles<
  TSource extends string,
  TTarget extends string,
  TState extends Exclude<ElementVisualState, 'default'>,
>(
  styles: ElementStyles<TSource, TState> | undefined,
  mapping: ComponentStylePartMapping<TSource, TTarget>,
): ElementStyles<TTarget, TState> | undefined {
  if (styles === undefined) return undefined;
  const parts: Partial<Record<TTarget, NonNullable<ElementStyles<TTarget, TState>['root']>>> = {};
  for (const [target, sources] of Object.entries(mapping) as [
    TTarget,
    TSource | readonly TSource[],
  ][]) {
    for (const source of typeof sources === 'string' ? [sources] : sources) {
      const style = styles.parts?.[source];
      if (style !== undefined) {
        parts[target] = style;
        break;
      }
    }
  }
  const states: Partial<Record<TState, ElementStateStyles<TTarget>>> = {};
  if (styles.states !== undefined) {
    for (const state of Object.keys(styles.states) as TState[]) {
      const stateStyles = styles.states[state];
      if (stateStyles === undefined) continue;
      const stateParts: Partial<Record<TTarget, NonNullable<ElementStyles<TTarget, TState>['root']>>> = {};
      for (const [target, sources] of Object.entries(mapping) as [
        TTarget,
        TSource | readonly TSource[],
      ][]) {
        for (const source of typeof sources === 'string' ? [sources] : sources) {
          const style = stateStyles.parts?.[source];
          if (style !== undefined) {
            stateParts[target] = style;
            break;
          }
        }
      }
      states[state] = Object.freeze({
        ...(stateStyles.root === undefined ? {} : { root: stateStyles.root }),
        ...(Object.keys(stateParts).length === 0 ? {} : { parts: Object.freeze(stateParts) }),
      });
    }
  }
  return Object.freeze({
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(Object.keys(parts).length === 0 ? {} : { parts: Object.freeze(parts) }),
    ...(Object.keys(states).length === 0 ? {} : { states: Object.freeze(states) }),
  }) as ElementStyles<TTarget, TState>;
}
