import { sameModelDependencies, type ModelPhase } from '../../visual/model-dependencies.ts';
import type { RenderNode } from './render-tree/types.ts';

/** Compare only the fixed renderer input, never callback closures or user object graphs. */
export function sameNodePhase(a: RenderNode, b: RenderNode, phase: Exclude<ModelPhase, 'paint'>): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.definition !== b.definition
    || !sameRecord(a.state, b.state)) return false;
  if (a.kind === 'component' && b.kind === 'component') {
    if (!sameModelDependencies(a.props.model, b.props.model, phase)
      || a.props.accessibleName !== b.props.accessibleName
      || a.props.accessibleRole !== b.props.accessibleRole
      || (a.children?.length ?? 0) !== 0 || (b.children?.length ?? 0) !== 0) return false;
  } else if (!sameStructuralProps(a.props, b.props)) return false;
  if (phase === 'measurement') return true;
  // Structural metadata is currently caller-owned; identity is not proof that
  // its contents stayed unchanged between renders of the same Element.
  if (a.kind !== 'component' && (hasExternalMetadata(a) || hasExternalMetadata(b))) return false;
  return sameNodeMetadata(a, b);
}

function hasKeys(node: RenderNode): boolean {
  return node.keyMap !== undefined && Object.keys(node.keyMap).length > 0;
}

function sameStructuralProps(a: object, b: object): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  const left = a as Readonly<Record<string, unknown>>;
  const right = b as Readonly<Record<string, unknown>>;
  return keys.every((key) => {
    if (!Object.hasOwn(right, key)) return false;
    const x = left[key];
    const y = right[key];
    if ((typeof x !== 'object' || x === null) && typeof x !== 'function' && Object.is(x, y)) return true;
    // These values are small, decoded layout descriptors, not opaque resources.
    if (key === 'padding' || key === 'margin') return Object.isFrozen(x) && Object.isFrozen(y) && sameRecord(x, y);
    if (key === 'sizes' || key === 'rows' || key === 'columns') {
      return sameDenseDescriptors(x, y);
    }
    return false;
  });
}

function sameRecord(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const left = a as Readonly<Record<string, unknown>>;
  const right = b as Readonly<Record<string, unknown>>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]));
}

function sameNodeMetadata(a: RenderNode, b: RenderNode): boolean {
  return sameModelDependencies(a.styles, b.styles, 'paint') && a.accessibility === b.accessibility
    && sameRecord(a.layer, b.layer) && sameRecord(a.focus, b.focus)
    && sameRecord(a.focusNavigation, b.focusNavigation)
    && a.transparentFocusIdentity === b.transparentFocusIdentity
    && a.focusable === b.focusable
    && hasKeys(a) === hasKeys(b)
    && (a.inputMap?.text !== undefined) === (b.inputMap?.text !== undefined)
    && (a.inputMap?.paste !== undefined) === (b.inputMap?.paste !== undefined);
}

function sameDenseDescriptors(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.hasOwn(a, index) || !Object.hasOwn(b, index) || !sameRecord(a[index], b[index])) return false;
  }
  return true;
}

function hasExternalMetadata(node: RenderNode): boolean {
  return node.layer !== undefined || node.focus !== undefined || node.accessibility !== undefined || node.styles !== undefined;
}
