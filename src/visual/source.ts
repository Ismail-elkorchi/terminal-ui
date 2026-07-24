import { sanitizeTerminalText } from '../text/index.ts';

export type FrameCellRole =
  | 'text'
  | 'border'
  | 'separator'
  | 'scrollbar'
  | 'cursor'
  | 'decoration'
  | 'chart'
  | 'custom';

const frameCellRoles = [
  'text',
  'border',
  'separator',
  'scrollbar',
  'cursor',
  'decoration',
  'chart',
  'custom'
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

const sanitizedFrameSources = new WeakSet<FrameCellSource>();
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
  if (sanitizedFrameSources.has(source)) return source;
  const normalized: FrameCellSource = {
    ...optionalTextField('elementId', source.elementId),
    ...optionalTextField('elementKind', source.elementKind),
    ...optionalTextField('rendererFamily', source.rendererFamily),
    ...optionalCellRole(source.cellRole),
    ...optionalTextField('partName', source.partName),
    ...optionalTextField('partType', source.partType),
    ...optionalTextField('itemId', source.itemId),
    ...optionalIndex(source.itemIndex),
    ...optionalInteractionState(source.interactionState),
    ...optionalTextField('description', source.description)
  };
  const key = frameSourceInternKey(normalized);
  const interned = internedFrameSources.get(key);
  if (interned !== undefined) return interned;
  const sanitized = Object.freeze(normalized);
  sanitizedFrameSources.add(sanitized);
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

function optionalTextField<Key extends keyof FrameCellSource>(
  key: Key,
  value: FrameCellSource[Key]
): Partial<FrameCellSource> {
  if (typeof value !== 'string') return {};
  const text = sanitizeTerminalText(value).text;
  return text.length === 0 ? {} : { [key]: text };
}

function optionalIndex(value: number | undefined): Pick<FrameCellSource, 'itemIndex'> {
  return typeof value === 'number' && Number.isFinite(value)
    ? { itemIndex: Math.max(0, Math.floor(value)) }
    : {};
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
