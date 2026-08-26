import {
  textDocumentApplyChangesExact,
  textDocumentLength,
  textDocumentSlice,
  type TextDocument
} from './document.ts';
import type { TextChangeSet, TextDocumentChange } from './types.ts';

declare const textChangePlanBrand: unique symbol;

/** A validated change set bound to the exact source document it can edit. */
export interface TextChangePlan extends TextChangeSet {
  readonly [textChangePlanBrand]: true;
}

interface TextChangePlanData {
  readonly document: TextDocument;
  readonly changeSet: TextChangeSet;
}

const ownedChangeSets = new WeakSet<object>();
const textChangePlans = new WeakMap<TextChangePlan, TextChangePlanData>();
export const emptyTextChangeSet: TextChangeSet = Object.freeze({ changes: Object.freeze([]) });
ownedChangeSets.add(emptyTextChangeSet);

export function createTextChangeSet(
  changes: readonly TextDocumentChange[]
): TextChangeSet {
  if (!Array.isArray(changes)) throw new TypeError('Text changes must be an array.');
  const owned = changes
    .map((change, index) => decodeTextDocumentChange(change, index))
    .filter((change) => change.startOffset !== change.endOffsetExclusive || change.insertedText.length > 0);
  for (let index = 1; index < owned.length; index += 1) {
    const previous = owned[index - 1];
    const current = owned[index];
    if (previous === undefined || current === undefined) continue;
    if (current.startOffset < previous.endOffsetExclusive) {
      throw new RangeError('Text changes must be ordered by source offset and must not overlap.');
    }
  }
  return ownChangeSet(owned);
}

export function applyTextChangeSet(
  document: TextDocument,
  changeSet: TextChangeSet
): TextDocument {
  const plan = createTextChangePlan(document, changeSet);
  return applyTextChangePlan(document, plan);
}

export function applyTextChangePlan(
  document: TextDocument,
  plan: TextChangePlan
): TextDocument {
  const changeSet = textChangePlanData(document, plan).changeSet;
  return textDocumentApplyChangesExact(document, changeSet.changes);
}

export function invertTextChangeSet(
  document: TextDocument,
  changeSet: TextChangeSet
): TextChangeSet {
  const plan = createTextChangePlan(document, changeSet);
  return invertTextChangePlan(document, plan);
}

export function invertTextChangePlan(
  document: TextDocument,
  plan: TextChangePlan
): TextChangeSet {
  const changeSet = textChangePlanData(document, plan).changeSet;
  let delta = 0;
  const inverted = changeSet.changes.map((change) => {
    const startOffset = change.startOffset + delta;
    const endOffsetExclusive = startOffset + change.insertedText.length;
    const insertedText = textDocumentSlice(
      document,
      change.startOffset,
      change.endOffsetExclusive
    );
    delta += change.insertedText.length
      - (change.endOffsetExclusive - change.startOffset);
    return Object.freeze({ startOffset, endOffsetExclusive, insertedText });
  });
  return ownChangeSet(inverted);
}

export function createTextChangePlan(
  document: TextDocument,
  changeSet: unknown
): TextChangePlan {
  if (
    changeSet === null
    || typeof changeSet !== 'object'
    || !Array.isArray((changeSet as { readonly changes?: unknown }).changes)
  ) {
    throw new TypeError('Text change set must contain a changes array.');
  }
  const candidate = changeSet as { readonly changes: readonly unknown[] };
  const changes = candidate.changes;
  const sourceLength = textDocumentLength(document);
  if (ownedChangeSets.has(candidate)) {
    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index] as TextDocumentChange | undefined;
      if (change !== undefined && change.endOffsetExclusive > sourceLength) {
        throw new RangeError(`Text changes[${String(index)}] exceeds the source document.`);
      }
    }
    return textChangePlan(document, changeSet as TextChangeSet);
  }
  const owned: TextDocumentChange[] = [];
  let previousEnd = 0;
  for (let index = 0; index < changes.length; index += 1) {
    const change = decodeTextDocumentChange(changes[index], index);
    if (change.endOffsetExclusive > sourceLength) {
      throw new RangeError(`Text changes[${String(index)}] exceeds the source document.`);
    }
    if (index > 0 && change.startOffset < previousEnd) {
      throw new RangeError('Text changes must be ordered by source offset and must not overlap.');
    }
    previousEnd = change.endOffsetExclusive;
    if (change.startOffset !== change.endOffsetExclusive || change.insertedText.length > 0) {
      owned.push(change);
    }
  }
  return textChangePlan(document, ownChangeSet(owned));
}

function ownChangeSet(changes: readonly TextDocumentChange[]): TextChangeSet {
  if (changes.length === 0) return emptyTextChangeSet;
  const owned = Object.freeze({ changes: Object.freeze(changes) });
  ownedChangeSets.add(owned);
  return owned;
}

function textChangePlan(
  document: TextDocument,
  changeSet: TextChangeSet,
): TextChangePlan {
  const plan = Object.freeze({ changes: changeSet.changes }) as TextChangePlan;
  textChangePlans.set(plan, { document, changeSet });
  return plan;
}

function textChangePlanData(
  document: TextDocument,
  plan: TextChangePlan,
): TextChangePlanData {
  const data = textChangePlans.get(plan);
  if (data?.document !== document) {
    throw new TypeError(
      'Text change plan must be created for this document by createTextChangePlan().',
    );
  }
  return data;
}

function decodeTextDocumentChange(value: unknown, index: number): TextDocumentChange {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`Text changes[${String(index)}] must be an object.`);
  }
  const candidate = value as Partial<TextDocumentChange>;
  const startOffset = candidate.startOffset;
  const endOffsetExclusive = candidate.endOffsetExclusive;
  if (
    typeof startOffset !== 'number'
    || typeof endOffsetExclusive !== 'number'
    || !Number.isSafeInteger(startOffset)
    || !Number.isSafeInteger(endOffsetExclusive)
    || startOffset < 0
    || endOffsetExclusive < startOffset
  ) {
    throw new RangeError(`Text changes[${String(index)}] has an invalid UTF-16 range.`);
  }
  if (typeof candidate.insertedText !== 'string') {
    throw new TypeError(`Text changes[${String(index)}].insertedText must be a string.`);
  }
  return Object.freeze({
    startOffset,
    endOffsetExclusive,
    insertedText: candidate.insertedText
  });
}
