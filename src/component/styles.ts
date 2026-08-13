import type { ElementStyles } from '../element/metadata.ts';

export type ComponentStylePartMapping<TSource extends string, TTarget extends string> = Readonly<
  Record<TTarget, TSource | readonly TSource[]>
>;

/** Projects parent anatomy onto child anatomy while preserving root and state styles. */
export function mapComponentStyles<TSource extends string, TTarget extends string>(
  styles: ElementStyles<TSource> | undefined,
  mapping: ComponentStylePartMapping<TSource, TTarget>,
): ElementStyles<TTarget> | undefined {
  if (styles === undefined) return undefined;
  const parts: Partial<Record<TTarget, NonNullable<ElementStyles<TTarget>['root']>>> = {};
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
  return Object.freeze({
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(Object.keys(parts).length === 0 ? {} : { parts: Object.freeze(parts) }),
    ...(styles.states === undefined ? {} : { states: styles.states }),
  });
}
