import { decodeAccessibleSnapshot } from '../accessibility/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isNonEmptyString,
  isStringMember,
} from '../foundation/validation.ts';
import { pointerEventKinds } from '../input/pointer.ts';
import type { CursorPosition, FrameCell, FrameHitTarget, Rect } from '../renderer/index.ts';
import { defineTextWidthProfile, measureTextCells } from '../text/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import { isFrameCellInteractionState, isFrameCellRole } from '../visual/frame-source.ts';
import type { FrameCellSource, RenderSpan, TerminalLink } from '../visual/index.ts';
import { decodeTerminalStyle } from '../visual/terminal-style.ts';
import type {
  GraphicOperationDescriptor,
  GraphicPlacementDescriptor,
  RasterImageDescriptor,
} from '../graphics/index.ts';
import type { TranscriptAdoptions } from './validation-adoptions.ts';

const frameCellSourceFields = new Set([
  'elementId', 'elementKind', 'rendererFamily', 'cellRole', 'partName', 'partType',
  'itemId', 'itemIndex', 'interactionState', 'description',
]);
const transcriptFrameFields = new Set([
  'width', 'height', 'widthProfile', 'canvasStyle', 'cells', 'graphics', 'hitTargets',
  'cursor', 'focusPath', 'accessibility',
]);
const frameCellFields = new Set([
  'row', 'column', 'text', 'width', 'style', 'link', 'source', 'continuation',
]);
const cursorFields = new Set(['row', 'column', 'style', 'source']);
const renderDiffFields = new Set([
  'width', 'height', 'widthProfile', 'canvasStyle', 'operations', 'graphicOperations',
  'cursor', 'fullRewrite', 'dirtyRegions',
]);
const textWidthProfileFields = new Set(['emoji', 'ambiguous']);
const writeOperationFields = new Set(['kind', 'row', 'column', 'spans']);
const clearRectOperationFields = new Set(['kind', 'bounds', 'style']);
const graphicPlacementFields = new Set(['id', 'image', 'bounds', 'clip', 'fit']);
const rasterImageFields = new Set(['width', 'height', 'format', 'byteLength', 'contentDigest']);
const placeGraphicOperationFields = new Set(['kind', 'placement']);
const removeGraphicOperationFields = new Set(['kind', 'id']);
const renderSpanFields = new Set(['text', 'style', 'link', 'source']);
const terminalLinkFields = new Set(['href', 'id']);
const frameHitTargetFields = new Set(['id', 'bounds', 'accepts', 'focus', 'cursor', 'zIndex']);
const resolvedFocusFields = new Set(['kind', 'path']);
const preservedFocusFields = new Set(['kind']);
const rectFields = new Set(['row', 'column', 'width', 'height']);

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isIntegerAtLeast(value: unknown, min: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function frameIssue(frame: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(frame)) return 'frame must be an object.';
  return adoptedFrameIssue(frame, adoptions);
}

function adoptedFrameIssue(
  frame: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions,
): string | undefined {
  const unknownField = findUnsupportedField(frame, transcriptFrameFields);
  if (unknownField !== undefined) return `frame contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(frame['width'], 0) || !isIntegerAtLeast(frame['height'], 0)) {
    return 'frame width and height must be non-negative integers.';
  }
  const widthProfile = textWidthProfileIssue(frame['widthProfile'], adoptions);
  if (widthProfile !== undefined) return `frame widthProfile: ${widthProfile}`;
  const canvasStyleIssue = terminalStyleIssue(frame['canvasStyle'], 'frame canvas style', adoptions);
  if (canvasStyleIssue !== undefined) return canvasStyleIssue;
  const cells = adoptedFrameCells(frame['cells'], adoptions);
  if (typeof cells === 'string') return cells;
  const graphics = adoptedFrameGraphics(frame['graphics'], Number(frame['width']), Number(frame['height']));
  if (typeof graphics === 'string') return graphics;
  const cursor = adoptedFrameCursor(frame['cursor'], adoptions);
  if (typeof cursor === 'string') return cursor;
  const hitTargets = adoptedFrameHitTargets(
    frame['hitTargets'],
    Number(frame['width']),
    Number(frame['height']),
  );
  if (typeof hitTargets === 'string') return hitTargets;
  return retainAdoptedFrame(frame, cells, graphics, cursor, hitTargets, adoptions);
}

function adoptedFrameCells(
  value: unknown,
  adoptions: TranscriptAdoptions,
): readonly FrameCell[] | string {
  if (!Array.isArray(value)) return 'frame cells must be an array.';
  const cells: FrameCell[] = [];
  for (const [index, cell] of value.entries()) {
    const issue = frameCellIssue(cell, adoptions);
    if (issue !== undefined) return `frame cell ${String(index)}: ${issue}`;
    if (isNonArrayObject(cell)) cells.push(decodedFrameCell(cell, adoptions));
  }
  return Object.freeze(cells);
}

function adoptedFrameGraphics(
  value: unknown,
  width: number,
  height: number,
): readonly GraphicPlacementDescriptor[] | string {
  if (!Array.isArray(value)) return 'frame graphics must be an array.';
  const graphics: GraphicPlacementDescriptor[] = [];
  for (const [index, placement] of value.entries()) {
    const decoded = decodedGraphicPlacement(placement, width, height);
    if (typeof decoded === 'string') return `frame graphic ${String(index)}: ${decoded}`;
    graphics.push(decoded);
  }
  return Object.freeze(graphics);
}

function adoptedFrameCursor(
  value: unknown,
  adoptions: TranscriptAdoptions,
): CursorPosition | string | undefined {
  if (value !== undefined) {
    const issue = cursorIssue(value, adoptions);
    if (issue !== undefined) return issue;
    if (isNonArrayObject(value)) return adoptions.cursors.get(value);
  }
  return undefined;
}

function adoptedFrameHitTargets(
  value: unknown,
  width: number,
  height: number,
): readonly FrameHitTarget[] | string | undefined {
  if (value !== undefined) {
    if (!Array.isArray(value)) return 'frame hitTargets must be an array.';
    const ownedTargets: FrameHitTarget[] = [];
    for (const [index, target] of value.entries()) {
      const issue = frameHitTargetIssue(target, width, height);
      if (issue !== undefined) return `frame hit target ${String(index)}: ${issue}`;
      if (isNonArrayObject(target)) ownedTargets.push(decodedFrameHitTarget(target));
    }
    return Object.freeze(ownedTargets);
  }
  return undefined;
}

function retainAdoptedFrame(
  frame: Readonly<Record<string, unknown>>,
  cells: readonly FrameCell[],
  graphics: readonly GraphicPlacementDescriptor[],
  cursor: CursorPosition | undefined,
  hitTargets: readonly FrameHitTarget[] | undefined,
  adoptions: TranscriptAdoptions,
): string | undefined {
  const focusPath = frame['focusPath'];
  if (focusPath !== undefined && !isStringArray(focusPath)) {
    return 'frame focusPath must be a string array.';
  }
  const accessibility = decodeSnapshot(frame['accessibility']);
  if (typeof accessibility === 'string') return `frame accessibility: ${accessibility}`;
  if (!isNonArrayObject(frame['widthProfile'])) return 'frame widthProfile was not adopted.';
  const profile = adoptions.widthProfiles.get(frame['widthProfile']);
  if (profile === undefined) return 'frame width profile was not adopted.';
  const canvasStyle = isNonArrayObject(frame['canvasStyle'])
    ? adoptions.styles.get(frame['canvasStyle'])
    : undefined;
  adoptions.frames.set(frame, Object.freeze({
    width: Number(frame['width']),
    height: Number(frame['height']),
    widthProfile: profile,
    ...(canvasStyle === undefined ? {} : { canvasStyle }),
    cells,
    graphics,
    ...(hitTargets === undefined ? {} : { hitTargets }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(focusPath === undefined ? {} : { focusPath: Object.freeze([...focusPath]) }),
    accessibility
  }));
  return undefined;
}

function frameCellIssue(cell: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(cell)) return 'cell must be an object.';
  const unknownField = findUnsupportedField(cell, frameCellFields);
  if (unknownField !== undefined) return `cell contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(cell['row'], 1) || !isIntegerAtLeast(cell['column'], 1)) {
    return 'row and column must be positive integers.';
  }
  if (typeof cell['text'] !== 'string') return 'text must be a string.';
  if (!isIntegerAtLeast(cell['width'], 0)) return 'width must be a non-negative integer.';
  if (cell['continuation'] !== undefined && typeof cell['continuation'] !== 'boolean') {
    return 'continuation must be a boolean.';
  }
  const style = terminalStyleIssue(cell['style'], 'cell style', adoptions);
  if (style !== undefined) return style;
  const link = terminalLinkIssue(cell['link']);
  if (link !== undefined) return `link: ${link}`;
  const sourceIssue = frameCellSourceIssue(cell['source']);
  if (sourceIssue !== undefined) return `source: ${sourceIssue}`;
  return undefined;
}

function cursorIssue(cursor: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(cursor)) return 'frame cursor must be an object.';
  const unknownField = findUnsupportedField(cursor, cursorFields);
  if (unknownField !== undefined) return `cursor contains unsupported field: ${unknownField}.`;
  const typed = cursor as Partial<CursorPosition>;
  if (!isIntegerAtLeast(typed.row, 1) || !isIntegerAtLeast(typed.column, 1)) {
    return 'frame cursor row and column must be positive integers.';
  }
  const style = terminalStyleIssue(cursor['style'], 'cursor style', adoptions);
  if (style !== undefined) return style;
  const sourceIssue = frameCellSourceIssue(cursor['source']);
  if (sourceIssue !== undefined) return `frame cursor source: ${sourceIssue}`;
  adoptions.cursors.set(cursor, decodedCursor(cursor, adoptions));
  return undefined;
}

export function renderDiffIssue(diff: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(diff)) return 'diff must be an object.';
  return adoptedRenderDiffIssue(diff, adoptions);
}

function adoptedRenderDiffIssue(
  diff: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions,
): string | undefined {
  const unknownField = findUnsupportedField(diff, renderDiffFields);
  if (unknownField !== undefined) return `diff contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(diff['width'], 0) || !isIntegerAtLeast(diff['height'], 0)) {
    return 'diff width and height must be non-negative integers.';
  }
  const widthProfile = textWidthProfileIssue(diff['widthProfile'], adoptions);
  if (widthProfile !== undefined) return `diff widthProfile: ${widthProfile}`;
  const normalizedWidthProfile = isNonArrayObject(diff['widthProfile'])
    ? adoptions.widthProfiles.get(diff['widthProfile'])
    : undefined;
  if (normalizedWidthProfile === undefined) return 'diff widthProfile was not adopted.';
  const width = Number(diff['width']);
  const height = Number(diff['height']);
  const canvasStyleIssue = terminalStyleIssue(diff['canvasStyle'], 'diff canvasStyle', adoptions);
  if (canvasStyleIssue !== undefined) return canvasStyleIssue;
  const fullRewrite = diff['fullRewrite'];
  if (typeof fullRewrite !== 'boolean') return 'diff fullRewrite must be a boolean.';
  const rawOperations = diff['operations'];
  if (!Array.isArray(rawOperations)) return 'diff operations must be an array.';
  if (!Array.isArray(diff['graphicOperations'])) return 'diff graphicOperations must be an array.';
  const cursorIssueResult = renderDiffCursorIssue(diff['cursor'], width, height, adoptions);
  if (cursorIssueResult !== undefined) return cursorIssueResult;
  const dirtyRegionsIssue = renderDiffDirtyRegionsIssue(diff['dirtyRegions'], width, height);
  if (dirtyRegionsIssue !== undefined) return dirtyRegionsIssue;
  const operationsIssue = adoptRenderOperations(
    rawOperations,
    width,
    height,
    normalizedWidthProfile,
    adoptions,
  );
  if (operationsIssue !== undefined) return operationsIssue;
  const graphicOperations = adoptGraphicOperations(diff['graphicOperations'], width, height);
  if (typeof graphicOperations === 'string') return graphicOperations;
  return retainAdoptedRenderDiff(
    diff,
    width,
    height,
    normalizedWidthProfile,
    rawOperations,
    graphicOperations,
    fullRewrite,
    adoptions,
  );
}

function renderDiffCursorIssue(
  cursor: unknown,
  width: number,
  height: number,
  adoptions: TranscriptAdoptions,
): string | undefined {
  if (cursor === undefined) return undefined;
  const issue = cursorIssue(cursor, adoptions);
  if (issue !== undefined) return `diff cursor: ${issue}`;
  return isNonArrayObject(cursor) && !pointFits(cursor, width, height)
    ? 'diff cursor must fit within the declared frame.'
    : undefined;
}

function renderDiffDirtyRegionsIssue(
  regions: unknown,
  width: number,
  height: number,
): string | undefined {
  if (regions === undefined) return undefined;
  if (!Array.isArray(regions)) return 'diff dirtyRegions must be an array.';
  for (const [index, rect] of regions.entries()) {
    const issue = boundedRectIssue(rect, width, height);
    if (issue !== undefined) return `diff dirtyRegions ${String(index)}: ${issue}`;
  }
  return undefined;
}

function adoptRenderOperations(
  operations: unknown,
  width: number,
  height: number,
  widthProfile: TextWidthProfile,
  adoptions: TranscriptAdoptions,
): string | undefined {
  if (!Array.isArray(operations)) return 'diff operations must be an array.';
  for (const [index, operation] of operations.entries()) {
    const issue = renderOperationIssue(operation, width, height, widthProfile, adoptions);
    if (issue !== undefined) return `diff operation ${String(index)}: ${issue}`;
  }
  return undefined;
}

function adoptGraphicOperations(
  operations: unknown,
  width: number,
  height: number,
): readonly GraphicOperationDescriptor[] | string {
  if (!Array.isArray(operations)) return 'diff graphicOperations must be an array.';
  const graphicOperations: GraphicOperationDescriptor[] = [];
  for (const [index, operation] of operations.entries()) {
    const decoded = decodedGraphicOperation(operation, width, height);
    if (typeof decoded === 'string') return `diff graphic operation ${String(index)}: ${decoded}`;
    graphicOperations.push(decoded);
  }
  return Object.freeze(graphicOperations);
}

function retainAdoptedRenderDiff(
  diff: Readonly<Record<string, unknown>>,
  width: number,
  height: number,
  normalizedWidthProfile: TextWidthProfile,
  rawOperations: readonly unknown[],
  graphicOperations: readonly GraphicOperationDescriptor[],
  fullRewrite: boolean,
  adoptions: TranscriptAdoptions,
): string | undefined {
  const operations = rawOperations.flatMap((operation) =>
    isNonArrayObject(operation) ? [adoptions.operations.get(operation)].filter(isDefined) : []);
  const cursor = isNonArrayObject(diff['cursor']) ? adoptions.cursors.get(diff['cursor']) : undefined;
  const canvasStyle = isNonArrayObject(diff['canvasStyle']) ? adoptions.styles.get(diff['canvasStyle']) : undefined;
  adoptions.diffs.set(diff, Object.freeze({
    width,
    height,
    widthProfile: normalizedWidthProfile,
    ...(canvasStyle === undefined ? {} : { canvasStyle }),
    operations: Object.freeze(operations),
    graphicOperations,
    ...(cursor === undefined ? {} : { cursor }),
    fullRewrite,
    ...(Array.isArray(diff['dirtyRegions'])
      ? { dirtyRegions: Object.freeze(diff['dirtyRegions'].flatMap((rect) =>
          isNonArrayObject(rect) ? [decodedRect(rect)] : [])) }
      : {})
  }));
  return undefined;
}

function textWidthProfileIssue(value: unknown, adoptions: TranscriptAdoptions): string | undefined {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknownField = findUnsupportedField(value, textWidthProfileFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
  try {
    adoptions.widthProfiles.set(value, defineTextWidthProfile(value));
    return undefined;
  } catch (cause) {
    return errorMessage(cause);
  }
}

function renderOperationIssue(
  operation: unknown,
  width: number,
  height: number,
  widthProfile: TextWidthProfile,
  adoptions: TranscriptAdoptions
): string | undefined {
  if (!isNonArrayObject(operation)) return 'operation must be an object.';
  switch (operation['kind']) {
    case 'write': {
      const unknownField = findUnsupportedField(operation, writeOperationFields);
      if (unknownField !== undefined) {
        return `write contains unsupported field: ${unknownField}.`;
      }
      if (!isIntegerAtLeast(operation['row'], 1) || !isIntegerAtLeast(operation['column'], 1)) {
        return 'write requires positive integer row and column.';
      }
      const row = Number(operation['row']);
      const column = Number(operation['column']);
      if (!Array.isArray(operation['spans']) || operation['spans'].length === 0) {
        return 'write requires at least one span.';
      }
      let columns = 0;
      const spans: RenderSpan[] = [];
      for (const item of operation['spans']) {
        if (!isNonArrayObject(item) || typeof item['text'] !== 'string') {
          return 'write spans must contain text.';
        }
        const unknownField = findUnsupportedField(item, renderSpanFields);
        if (unknownField !== undefined) {
          return `write span contains unsupported field: ${unknownField}.`;
        }
        const style = terminalStyleIssue(item['style'], 'write span style', adoptions);
        if (style !== undefined) return style;
        const link = terminalLinkIssue(item['link']);
        if (link !== undefined) return `write span link: ${link}`;
        const sourceIssue = frameCellSourceIssue(item['source']);
        if (sourceIssue !== undefined) return `write span source: ${sourceIssue}`;
        columns += measureTextCells(item['text'], { widthProfile }).cells;
        spans.push(decodedRenderSpan(item, adoptions));
      }
      if (columns <= 0) return 'write must affect at least one terminal cell.';
      if (row > height || column + columns - 1 > width) {
        return 'write must fit within the declared frame.';
      }
      adoptions.operations.set(operation, Object.freeze({
        kind: 'write',
        row,
        column,
        spans: Object.freeze(spans)
      }));
      return undefined;
    }
    case 'clearRect': {
      const unknownField = findUnsupportedField(operation, clearRectOperationFields);
      if (unknownField !== undefined) {
        return `clearRect contains unsupported field: ${unknownField}.`;
      }
      const issue = boundedRectIssue(operation['bounds'], width, height);
      if (issue !== undefined) return issue;
      const styleIssue = terminalStyleIssue(operation['style'], 'clearRect style', adoptions);
      if (styleIssue !== undefined) return styleIssue;
      if (isNonArrayObject(operation['bounds'])) {
        const style = isNonArrayObject(operation['style'])
          ? adoptions.styles.get(operation['style'])
          : undefined;
        adoptions.operations.set(operation, Object.freeze({
          kind: 'clearRect',
          bounds: decodedRect(operation['bounds']),
          ...(style === undefined ? {} : { style })
        }));
      }
      return undefined;
    }
    default:
      return `unsupported diff operation kind: ${String(operation['kind'])}.`;
  }
}

function frameCellSourceIssue(source: unknown): string | undefined {
  if (source === undefined) return undefined;
  if (!isNonArrayObject(source)) return 'must be an object.';
  const unknownField = findUnsupportedField(source, frameCellSourceFields);
  if (unknownField !== undefined) return `unsupported field: ${unknownField}.`;
  for (const field of [
    'elementId',
    'elementKind',
    'rendererFamily',
    'partName',
    'partType',
    'itemId',
    'description'
  ] as const) {
    if (source[field] !== undefined && typeof source[field] !== 'string') {
      return `${field} must be a string.`;
    }
  }
  if (source['itemIndex'] !== undefined && !isIntegerAtLeast(source['itemIndex'], 0)) {
    return 'itemIndex must be a non-negative integer.';
  }
  if (source['cellRole'] !== undefined && !isFrameCellRole(source['cellRole'])) {
    return 'cellRole must identify a supported frame-cell role.';
  }
  if (
    source['interactionState'] !== undefined
    && !isFrameCellInteractionState(source['interactionState'])
  ) {
    return 'interactionState must be focused, hovered, pressed, selected, disabled, or active.';
  }
  return undefined;
}

function terminalStyleIssue(
  style: unknown,
  subject: string,
  adoptions: TranscriptAdoptions
): string | undefined {
  if (style === undefined) return undefined;
  try {
    if (!isNonArrayObject(style)) return `${subject} must be an object.`;
    const normalized = decodeTerminalStyle(style, subject);
    adoptions.styles.set(style, normalized);
    return undefined;
  } catch (cause) {
    return errorMessage(cause);
  }
}

function terminalLinkIssue(link: unknown): string | undefined {
  if (link === undefined) return undefined;
  if (!isNonArrayObject(link)) return 'must be an object.';
  const unknownField = findUnsupportedField(link, terminalLinkFields);
  if (unknownField !== undefined) return `unsupported field: ${unknownField}.`;
  if (typeof link['href'] !== 'string') return 'href must be a string.';
  if (link['id'] !== undefined && typeof link['id'] !== 'string') return 'id must be a string.';
  return undefined;
}

function decodedFrameCell(
  cell: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions
): FrameCell {
  const style = isNonArrayObject(cell['style']) ? adoptions.styles.get(cell['style']) : undefined;
  return Object.freeze({
    row: Number(cell['row']),
    column: Number(cell['column']),
    text: String(cell['text']),
    width: Number(cell['width']),
    ...(style === undefined ? {} : { style }),
    ...decodedLinkField(cell['link']),
    ...decodedSourceField(cell['source']),
    ...(typeof cell['continuation'] === 'boolean' ? { continuation: cell['continuation'] } : {})
  });
}

function decodedCursor(
  cursor: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions
): CursorPosition {
  const style = isNonArrayObject(cursor['style']) ? adoptions.styles.get(cursor['style']) : undefined;
  return Object.freeze({
    row: Number(cursor['row']),
    column: Number(cursor['column']),
    ...(style === undefined ? {} : { style }),
    ...decodedSourceField(cursor['source'])
  });
}

function decodedRenderSpan(
  span: Readonly<Record<string, unknown>>,
  adoptions: TranscriptAdoptions
): RenderSpan {
  const style = isNonArrayObject(span['style']) ? adoptions.styles.get(span['style']) : undefined;
  return Object.freeze({
    text: String(span['text']),
    ...(style === undefined ? {} : { style }),
    ...decodedLinkField(span['link']),
    ...decodedSourceField(span['source'])
  });
}

function decodedLinkField(value: unknown): { readonly link?: TerminalLink } {
  if (!isNonArrayObject(value) || typeof value['href'] !== 'string') return {};
  return { link: Object.freeze({
    href: value['href'],
    ...(typeof value['id'] === 'string' ? { id: value['id'] } : {})
  }) };
}

function decodedSourceField(value: unknown): { readonly source?: FrameCellSource } {
  if (!isNonArrayObject(value)) return {};
  return { source: Object.freeze({
    ...(typeof value['elementId'] === 'string' ? { elementId: value['elementId'] } : {}),
    ...(typeof value['elementKind'] === 'string' ? { elementKind: value['elementKind'] } : {}),
    ...(typeof value['rendererFamily'] === 'string' ? { rendererFamily: value['rendererFamily'] } : {}),
    ...(isFrameCellRole(value['cellRole']) ? { cellRole: value['cellRole'] } : {}),
    ...(typeof value['partName'] === 'string' ? { partName: value['partName'] } : {}),
    ...(typeof value['partType'] === 'string' ? { partType: value['partType'] } : {}),
    ...(typeof value['itemId'] === 'string' ? { itemId: value['itemId'] } : {}),
    ...(typeof value['itemIndex'] === 'number' ? { itemIndex: value['itemIndex'] } : {}),
    ...(isFrameCellInteractionState(value['interactionState'])
      ? { interactionState: value['interactionState'] }
      : {}),
    ...(typeof value['description'] === 'string' ? { description: value['description'] } : {})
  }) };
}

function frameHitTargetIssue(target: unknown, width: number, height: number): string | undefined {
  if (!isNonArrayObject(target)) return 'must be an object.';
  const unknownField = findUnsupportedField(target, frameHitTargetFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
  if (!isNonEmptyString(target['id'])) return 'id must be a non-empty string.';
  const bounds = frameRectIssue(target['bounds'], width, height);
  if (bounds !== undefined) return `bounds: ${bounds}`;
  if (target['accepts'] !== undefined) {
    if (!Array.isArray(target['accepts'])
      || target['accepts'].some((kind) => !isStringMember(kind, pointerEventKinds))
      || new Set(target['accepts']).size !== target['accepts'].length) {
      return 'accepts must contain unique supported pointer event kinds.';
    }
  }
  const focus = target['focus'];
  if (focus !== undefined) {
    if (!isNonArrayObject(focus)) return 'focus must be an object.';
    if (focus['kind'] === 'focus') {
      const unknownField = findUnsupportedField(focus, resolvedFocusFields);
      if (unknownField !== undefined) {
        return `focus contains unsupported field: ${unknownField}.`;
      }
      if (!isStringArray(focus['path']) || focus['path'].length === 0) {
        return 'focus path must be a non-empty string array.';
      }
    } else if (focus['kind'] === 'preserve') {
      const unknownField = findUnsupportedField(focus, preservedFocusFields);
      if (unknownField !== undefined) {
        return `focus contains unsupported field: ${unknownField}.`;
      }
    } else {
      return 'focus must be a resolved focus or preserve intent.';
    }
  }
  if (target['cursor'] !== undefined
    && !isStringMember(target['cursor'], ['pointer', 'text', 'default'] as const)) {
    return 'cursor must be pointer, text, or default.';
  }
  if (target['zIndex'] !== undefined && !Number.isSafeInteger(target['zIndex'])) {
    return 'zIndex must be a safe integer.';
  }
  return undefined;
}

function decodedFrameHitTarget(target: Readonly<Record<string, unknown>>): FrameHitTarget {
  const focus = target['focus'];
  if (!isNonArrayObject(target['bounds'])) {
    throw new Error('Validated frame hit target bounds are missing.');
  }
  return Object.freeze({
    id: String(target['id']),
    bounds: decodedRect(target['bounds']),
    ...(Array.isArray(target['accepts'])
      ? { accepts: Object.freeze(target['accepts'].filter(isPointerEventKind)) }
      : {}),
    ...(isNonArrayObject(focus) && focus['kind'] === 'preserve'
      ? { focus: Object.freeze({ kind: 'preserve' as const }) }
      : isNonArrayObject(focus) && focus['kind'] === 'focus' && Array.isArray(focus['path'])
        ? { focus: Object.freeze({
            kind: 'focus' as const,
            path: Object.freeze(focus['path'].filter((item): item is string => typeof item === 'string'))
          }) }
        : {}),
    ...(target['cursor'] === 'pointer' || target['cursor'] === 'text' || target['cursor'] === 'default'
      ? { cursor: target['cursor'] }
      : {}),
    ...(typeof target['zIndex'] === 'number' ? { zIndex: target['zIndex'] } : {})
  });
}

function isPointerEventKind(value: unknown): value is NonNullable<FrameHitTarget['accepts']>[number] {
  return isStringMember(value, pointerEventKinds);
}

function decodedGraphicOperation(
  value: unknown,
  width: number,
  height: number,
): GraphicOperationDescriptor | string {
  if (!isNonArrayObject(value)) return 'must be an object.';
  if (value['kind'] === 'remove') {
    const unknown = findUnsupportedField(value, removeGraphicOperationFields);
    if (unknown !== undefined) return `remove contains unsupported field: ${unknown}.`;
    return isNonEmptyString(value['id'])
      ? Object.freeze({ kind: 'remove', id: value['id'] })
      : 'remove requires a non-empty id.';
  }
  if (value['kind'] !== 'place') return 'kind must be place or remove.';
  const unknown = findUnsupportedField(value, placeGraphicOperationFields);
  if (unknown !== undefined) return `place contains unsupported field: ${unknown}.`;
  const placement = decodedGraphicPlacement(value['placement'], width, height);
  return typeof placement === 'string' ? placement : Object.freeze({ kind: 'place', placement });
}

function decodedGraphicPlacement(
  value: unknown,
  width: number,
  height: number,
): GraphicPlacementDescriptor | string {
  if (!isNonArrayObject(value)) return 'placement must be an object.';
  const unknown = findUnsupportedField(value, graphicPlacementFields);
  if (unknown !== undefined) return `placement contains unsupported field: ${unknown}.`;
  if (!isNonEmptyString(value['id'])) return 'placement id must be non-empty.';
  if (value['fit'] !== 'contain' && value['fit'] !== 'cover' && value['fit'] !== 'fill') {
    return 'placement fit must be contain, cover, or fill.';
  }
  const boundsIssue = graphicBoundsIssue(value['bounds']);
  if (boundsIssue !== undefined) return `placement bounds ${boundsIssue}`;
  const clipIssue = boundedRectIssue(value['clip'], width, height);
  if (clipIssue !== undefined) return `placement clip ${clipIssue}`;
  const image = decodedRasterImage(value['image']);
  if (typeof image === 'string') return `placement image ${image}`;
  if (!isNonArrayObject(value['bounds']) || !isNonArrayObject(value['clip'])) return 'placement rectangles were not decoded.';
  const bounds = decodedRect(value['bounds']);
  const clip = decodedRect(value['clip']);
  if (!rectContains(bounds, clip)) return 'placement bounds must contain its clip.';
  return Object.freeze({ id: value['id'], image, bounds, clip, fit: value['fit'] });
}

function decodedRasterImage(value: unknown): RasterImageDescriptor | string {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknown = findUnsupportedField(value, rasterImageFields);
  if (unknown !== undefined) return `contains unsupported field: ${unknown}.`;
  if (!isIntegerAtLeast(value['width'], 1) || !isIntegerAtLeast(value['height'], 1)) {
    return 'dimensions must be positive integers.';
  }
  if (value['format'] !== 'rgb8' && value['format'] !== 'rgba8') return 'format must be rgb8 or rgba8.';
  const expected = Number(value['width']) * Number(value['height']) * (value['format'] === 'rgb8' ? 3 : 4);
  if (!Number.isSafeInteger(expected) || value['byteLength'] !== expected) return 'byteLength does not match dimensions and format.';
  if (typeof value['contentDigest'] !== 'string' || !/^raster:sha256:[0-9a-f]{64}$/u.test(value['contentDigest'])) {
    return 'contentDigest must be a canonical raster SHA-256 identity.';
  }
  return Object.freeze({
    width: Number(value['width']),
    height: Number(value['height']),
    format: value['format'],
    byteLength: expected,
    contentDigest: value['contentDigest'],
  });
}

function graphicBoundsIssue(value: unknown): string | undefined {
  if (!isNonArrayObject(value)) return 'must be an object.';
  const unknown = findUnsupportedField(value, rectFields);
  if (unknown !== undefined) return `contain unsupported field: ${unknown}.`;
  return Number.isSafeInteger(value['row'])
    && Number.isSafeInteger(value['column'])
    && isIntegerAtLeast(value['width'], 1)
    && isIntegerAtLeast(value['height'], 1)
    && Number.isSafeInteger(Number(value['row']) + Number(value['height']))
    && Number.isSafeInteger(Number(value['column']) + Number(value['width']))
    ? undefined
    : 'must contain safe integer coordinates and positive dimensions.';
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.row >= outer.row
    && inner.column >= outer.column
    && inner.row + inner.height <= outer.row + outer.height
    && inner.column + inner.width <= outer.column + outer.width;
}

function frameRectIssue(rect: unknown, width: number, height: number): string | undefined {
  if (!isNonArrayObject(rect)) return 'must be an object.';
  const unknownField = findUnsupportedField(rect, rectFields);
  if (unknownField !== undefined) return `contains unsupported field: ${unknownField}.`;
  if (!isIntegerAtLeast(rect['row'], 1)
    || !isIntegerAtLeast(rect['column'], 1)
    || !isIntegerAtLeast(rect['width'], 0)
    || !isIntegerAtLeast(rect['height'], 0)) {
    return 'must contain positive integer coordinates and non-negative integer dimensions.';
  }
  return Number(rect['row']) + Number(rect['height']) - 1 <= height
    && Number(rect['column']) + Number(rect['width']) - 1 <= width
    ? undefined
    : 'must fit within the declared frame.';
}

function decodedRect(rect: Readonly<Record<string, unknown>>): Rect {
  return Object.freeze({
    row: Number(rect['row']),
    column: Number(rect['column']),
    width: Number(rect['width']),
    height: Number(rect['height'])
  });
}

function rectIssue(rect: unknown): string | undefined {
  if (!isNonArrayObject(rect)) return 'clearRect bounds must be an object.';
  const unknownField = findUnsupportedField(rect, rectFields);
  if (unknownField !== undefined) return `bounds contain unsupported field: ${unknownField}.`;
  return isIntegerAtLeast(rect['row'], 1)
    && isIntegerAtLeast(rect['column'], 1)
    && isIntegerAtLeast(rect['width'], 1)
    && isIntegerAtLeast(rect['height'], 1)
    ? undefined
    : 'clearRect bounds must contain row, column, width, and height.';
}

function boundedRectIssue(rect: unknown, width: number, height: number): string | undefined {
  const issue = rectIssue(rect);
  if (issue !== undefined) return issue;
  if (!isNonArrayObject(rect)) return 'bounds must be an object.';
  return Number(rect['row']) + Number(rect['height']) - 1 <= height
    && Number(rect['column']) + Number(rect['width']) - 1 <= width
    ? undefined
    : 'bounds must fit within the declared frame.';
}

function pointFits(point: Record<string, unknown>, width: number, height: number): boolean {
  return typeof point['row'] === 'number'
    && typeof point['column'] === 'number'
    && point['row'] <= height
    && point['column'] <= width;
}

export function decodeSnapshot(snapshot: unknown): AccessibleSnapshot | string {
  const result = decodeAccessibleSnapshot(snapshot);
  if (result.status === 'failure') return result.error.message;
  return result.value;
}
