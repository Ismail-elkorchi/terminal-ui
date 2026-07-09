import type { RenderNode } from '../render-node/index.ts';
import { sanitizeTerminalText } from '../text/index.ts';

import type { FrameSemanticRole } from './frame-passes/index.ts';

export interface FrameCellSource {
  readonly ownerId?: string;
  readonly ownerKind?: string;
  readonly family?: string;
  readonly role?: FrameSemanticRole;
  readonly part?: string;
  readonly partKind?: string;
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly state?: string;
  readonly label?: string;
}

export interface RenderNodeFrameSourceOptions {
  readonly family?: string;
  readonly role?: FrameSemanticRole;
  readonly part?: string;
  readonly partKind?: string;
  readonly itemId?: string;
  readonly itemIndex?: number;
  readonly state?: string;
  readonly label?: string;
}

const sanitizedFrameSources = new WeakSet<FrameCellSource>();
const frameSourceInternLimit = 8192;
const internedFrameSources = new Map<string, FrameCellSource>();

export function renderNodeFrameSource(widget: Pick<RenderNode, 'id' | 'kind'>, options: RenderNodeFrameSourceOptions = {}): FrameCellSource {
  return sanitizeFrameCellSource({
    ...(widget.id === undefined ? {} : { ownerId: widget.id }),
    ownerKind: widget.kind,
    ...options
  });
}

export function frameCellSource(input: FrameCellSource): FrameCellSource {
  return sanitizeFrameCellSource(input);
}

export function frameSourcePart(
  source: FrameCellSource | undefined,
  options: Pick<RenderNodeFrameSourceOptions, 'part' | 'partKind' | 'state' | 'label'>
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
    ...optionalTextField('ownerId', source.ownerId),
    ...optionalTextField('ownerKind', source.ownerKind),
    ...optionalTextField('family', source.family),
    ...optionalTextField('role', source.role),
    ...optionalTextField('part', source.part),
    ...optionalTextField('partKind', source.partKind),
    ...optionalTextField('itemId', source.itemId),
    ...optionalIndex(source.itemIndex),
    ...optionalTextField('state', source.state),
    ...optionalTextField('label', source.label)
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
  return left.ownerId === right.ownerId
    && left.ownerKind === right.ownerKind
    && left.family === right.family
    && left.role === right.role
    && left.part === right.part
    && left.partKind === right.partKind
    && left.itemId === right.itemId
    && left.itemIndex === right.itemIndex
    && left.state === right.state
    && left.label === right.label;
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

function frameSourceInternKey(source: FrameCellSource): string {
  return [
    source.ownerId ?? '',
    source.ownerKind ?? '',
    source.family ?? '',
    source.role ?? '',
    source.part ?? '',
    source.partKind ?? '',
    source.itemId ?? '',
    source.itemIndex === undefined ? '' : String(source.itemIndex),
    source.state ?? '',
    source.label ?? ''
  ].join('\u0000');
}

function trimInternedFrameSources(): void {
  while (internedFrameSources.size > frameSourceInternLimit) {
    const oldest = internedFrameSources.keys().next().value;
    if (oldest === undefined) return;
    internedFrameSources.delete(oldest);
  }
}
