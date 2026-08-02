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
  readonly interactionState?: 'focused' | 'hovered' | 'pressed' | 'selected' | 'disabled' | 'active';
  readonly description?: string;
}

export interface RenderNodeFrameSourceOptions {
  readonly rendererFamily?: string;
  readonly cellRole?: FrameCellRole;
  readonly partName?: string;
  readonly partType?: string;
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly interactionState?: 'focused' | 'hovered' | 'pressed' | 'selected' | 'disabled' | 'active';
  readonly description?: string;
}

const sanitizedFrameSources = new WeakMap<object, FrameCellSource>();
const frameSourceInternLimit = 8192;
const internedFrameSources = new Map<string, FrameCellSource>();

export function renderNodeFrameSource(
  renderNode: { readonly id?: string; readonly kind: string },
  options: RenderNodeFrameSourceOptions = {}
): FrameCellSource {
  return sanitizeFrameCellSource({
    ...(renderNode.id === undefined ? {} : { elementId: renderNode.id }),
    elementKind: renderNode.kind,
    ...options
  });
}

export function frameCellSource(input: FrameCellSource): FrameCellSource {
  return sanitizeFrameCellSource(input);
}

export function frameSourcePart(
  source: FrameCellSource | undefined,
  options: Pick<RenderNodeFrameSourceOptions, 'partName' | 'partType' | 'interactionState' | 'description'>
): FrameCellSource | undefined {
  if (source === undefined) return undefined;
  return sanitizeFrameCellSource({
    ...source,
    ...options
  });
}

export function sanitizeFrameCellSource(source: FrameCellSource): FrameCellSource {
  return normalizeUntrustedFrameCellSource(source);
}

export function normalizeUntrustedFrameCellSource(source: unknown): FrameCellSource {
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
  const key = frameSourceInternKey(normalized);
  const interned = internedFrameSources.get(key);
  if (interned !== undefined) return interned;
  const sanitized = Object.freeze(normalized);
  sanitizedFrameSources.set(sanitized, sanitized);
  internedFrameSources.set(key, sanitized);
  trimInternedFrameSources();
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
  'active'
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

function frameSourceInternKey(source: FrameCellSource): string {
  return [
    source.elementId ?? '',
    source.elementKind ?? '',
    source.rendererFamily ?? '',
    source.cellRole ?? '',
    source.partName ?? '',
    source.partType ?? '',
    source.itemId ?? '',
    source.itemIndex === undefined ? '' : String(source.itemIndex),
    source.interactionState ?? '',
    source.description ?? ''
  ].join('\u0000');
}

function trimInternedFrameSources(): void {
  while (internedFrameSources.size > frameSourceInternLimit) {
    const oldest = internedFrameSources.keys().next().value;
    if (oldest === undefined) return;
    internedFrameSources.delete(oldest);
  }
}
