export type FocusPath = readonly string[];

export type InitialFocusSelector =
  | { readonly kind: 'path'; readonly path: FocusPath }
  | { readonly kind: 'element'; readonly elementId: string }
  | { readonly kind: 'elementTarget'; readonly elementId: string; readonly targetId: string };

export type PointerFocusIntent =
  | { readonly kind: 'target'; readonly targetId: string }
  | { readonly kind: 'preserve' };

export type ResolvedPointerFocusIntent =
  | { readonly kind: 'focus'; readonly path: FocusPath }
  | { readonly kind: 'preserve' };

export function focusPathsEqual(
  left: FocusPath | undefined,
  right: FocusPath | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
