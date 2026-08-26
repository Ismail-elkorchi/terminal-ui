import { sanitizeTerminalText } from '../text/index.ts';
import { isNonArrayObject } from '../foundation/validation.ts';

export type FrameCellRole =
  | 'text'
  | 'border'
  | 'separator'
  | 'scrollbar'
  | 'cursor'
  | 'decoration'
  | 'chart'
  | 'content';

/** Visual conditions that can independently affect an element's anatomy. */
export type ElementVisualState =
  | 'default'
  | 'focused'
  | 'hovered'
  | 'pressed'
  | 'selected'
  | 'disabled'
  | 'active'
  | 'busy'
  | 'readOnly';

const frameCellRoles = [
  'text',
  'border',
  'separator',
  'scrollbar',
  'cursor',
  'decoration',
  'chart',
  'content'
] as const satisfies readonly FrameCellRole[];

export interface FrameCellSource {
  readonly elementId?: string;
  readonly elementKind?: string;
  readonly rendererFamily?: string;
  readonly cellRole?: FrameCellRole;
  readonly partName?: string;
  readonly partType?: string;
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly interactionState?: Exclude<ElementVisualState, 'default'>;
  readonly description?: string;
}

export interface RenderNodeFrameSourceOptions {
  readonly rendererFamily?: string;
  readonly cellRole?: FrameCellRole;
  readonly partName?: string;
  readonly partType?: string;
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly interactionState?: Exclude<ElementVisualState, 'default'>;
  readonly description?: string;
}

const sanitizedFrameSources = new WeakMap<object, FrameCellSource>();
const canonicalFrameSources = new Map<string, FrameCellSource>();
const maximumCanonicalFrameSources = 16_384;
const maximumCanonicalFrameSourceKeyLength = 2_048;
const maximumCanonicalFrameSourceWeight = 1_048_576;
let canonicalFrameSourceWeight = 0;

export function renderNodeFrameSource(
  renderNode: { readonly id?: string; readonly kind: string },
  options: RenderNodeFrameSourceOptions = {}
): FrameCellSource {
  return frameCellSource({
    ...(renderNode.id === undefined ? {} : { elementId: renderNode.id }),
    elementKind: renderNode.kind,
    ...options
  });
}

export function frameCellSource(input: FrameCellSource): FrameCellSource {
  return decodeFrameCellSource(input);
}

export function frameSourcePart(
  source: FrameCellSource | undefined,
  options: Pick<RenderNodeFrameSourceOptions, 'partName' | 'partType' | 'interactionState' | 'description'>
): FrameCellSource | undefined {
  if (source === undefined) return undefined;
  return frameCellSource({
    ...source,
    ...options
  });
}

/** Combines a source already admitted at a render boundary with framework-owned fields. */
export function deriveFrameCellSource(
  source: FrameCellSource | undefined,
  fields: FrameCellSource,
): FrameCellSource {
  return canonicalFrameCellSource({ ...source, ...fields });
}

export function decodeFrameCellSource(source: unknown): FrameCellSource {
  if (!isNonArrayObject(source)) {
    throw new TypeError('Frame cell source must be an object.');
  }
  const existing = sanitizedFrameSources.get(source);
  if (existing !== undefined) return existing;
  const normalized: FrameCellSource = {
    ...optionalTextField('elementId', source['elementId']),
    ...optionalTextField('elementKind', source['elementKind']),
    ...optionalTextField('rendererFamily', source['rendererFamily']),
    ...optionalCellRole(source['cellRole']),
    ...optionalTextField('partName', source['partName']),
    ...optionalTextField('partType', source['partType']),
    ...optionalTextField('itemId', source['itemId']),
    ...optionalIndex(source['itemIndex']),
    ...optionalInteractionState(source['interactionState']),
    ...optionalTextField('description', source['description'])
  };
  const sanitized = canonicalFrameCellSource(normalized);
  if (Object.isFrozen(source)) sanitizedFrameSources.set(source, sanitized);
  return sanitized;
}

export function sameFrameCellSource(left: FrameCellSource | undefined, right: FrameCellSource | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.elementId === right.elementId
    && left.elementKind === right.elementKind
    && left.rendererFamily === right.rendererFamily
    && left.cellRole === right.cellRole
    && left.partName === right.partName
    && left.partType === right.partType
    && left.itemId === right.itemId
    && left.itemIndex === right.itemIndex
    && left.interactionState === right.interactionState
    && left.description === right.description;
}

function optionalTextField(
  key: 'elementId' | 'elementKind' | 'rendererFamily' | 'partName' | 'partType' | 'itemId' | 'description',
  value: unknown
): Partial<FrameCellSource> {
  if (typeof value !== 'string') return {};
  const text = sanitizeTerminalText(value).text;
  if (text.length === 0) return {};
  switch (key) {
    case 'elementId': return { elementId: text };
    case 'elementKind': return { elementKind: text };
    case 'rendererFamily': return { rendererFamily: text };
    case 'partName': return { partName: text };
    case 'partType': return { partType: text };
    case 'itemId': return { itemId: text };
    case 'description': return { description: text };
  }
}

function optionalIndex(value: unknown): Pick<FrameCellSource, 'itemIndex'> {
  if (value === undefined) return {};
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError('Frame cell source itemIndex must be a non-negative integer.');
  }
  return { itemIndex: value };
}

function canonicalFrameCellSource(source: FrameCellSource): FrameCellSource {
  const key = JSON.stringify([
    source.elementId ?? null,
    source.elementKind ?? null,
    source.rendererFamily ?? null,
    source.cellRole ?? null,
    source.partName ?? null,
    source.partType ?? null,
    source.itemId ?? null,
    source.itemIndex ?? null,
    source.interactionState ?? null,
    source.description ?? null,
  ]);
  const existing = canonicalFrameSources.get(key);
  if (existing !== undefined) return existing;
  const canonical = Object.freeze({ ...source });
  sanitizedFrameSources.set(canonical, canonical);
  if (key.length > maximumCanonicalFrameSourceKeyLength) return canonical;
  canonicalFrameSources.set(key, canonical);
  canonicalFrameSourceWeight += key.length;
  while (
    canonicalFrameSources.size > maximumCanonicalFrameSources
    || canonicalFrameSourceWeight > maximumCanonicalFrameSourceWeight
  ) {
    const oldest = canonicalFrameSources.keys().next().value;
    if (oldest === undefined) break;
    canonicalFrameSources.delete(oldest);
    canonicalFrameSourceWeight -= oldest.length;
  }
  return canonical;
}

function optionalCellRole(value: unknown): Pick<FrameCellSource, 'cellRole'> {
  if (value === undefined) return {};
  if (isFrameCellRole(value)) {
    return { cellRole: value };
  }
  throw new TypeError(`Frame cell source cellRole must be one of ${frameCellRoles.join(', ')}.`);
}

export function isFrameCellRole(value: unknown): value is FrameCellRole {
  return typeof value === 'string' && (frameCellRoles as readonly string[]).includes(value);
}

const interactionStates = [
  'focused',
  'hovered',
  'pressed',
  'selected',
  'disabled',
  'active',
  'busy',
  'readOnly'
] as const satisfies readonly NonNullable<FrameCellSource['interactionState']>[];

function optionalInteractionState(value: unknown): Pick<FrameCellSource, 'interactionState'> {
  if (value === undefined) return {};
  if (isFrameCellInteractionState(value)) {
    return { interactionState: value };
  }
  throw new TypeError(
    `Frame cell source interactionState must be one of ${interactionStates.join(', ')}.`
  );
}

export function isFrameCellInteractionState(
  value: unknown
): value is NonNullable<FrameCellSource['interactionState']> {
  return typeof value === 'string'
    && (interactionStates as readonly string[]).includes(value);
}
