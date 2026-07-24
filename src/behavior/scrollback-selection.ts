import { extractTextSelection } from '../text/index.ts';
import {
  scrollbackHistoryRecordById
} from '../ui-model/scrollback-history.ts';
import type { ScrollbackHistory, ScrollbackHistoryRecord } from '../ui-model/scrollback-history.ts';
import type { ScrollbackBodyAnchor, ScrollbackSelection } from '../ui-model/scrollback.ts';

export interface ExtractScrollbackSelectionTextInput {
  readonly history: ScrollbackHistory;
  readonly selection?: ScrollbackSelection;
}

export function extractScrollbackSelectionText(
  input: ExtractScrollbackSelectionTextInput
): string | undefined {
  if (input.selection === undefined) return undefined;
  const normalized = normalizedSelection(input.history, input.selection);
  if (normalized === undefined) return undefined;
  if (
    normalized.start.itemId === normalized.end.itemId
    && normalized.start.offset === normalized.end.offset
  ) return '';
  const selected: string[] = [];
  for (const segment of input.history.segments) {
    for (const record of segment.records) {
      if (record.itemIndex < normalized.startRecord.itemIndex) continue;
      if (record.itemIndex > normalized.endRecord.itemIndex) return selected.join('\n');
      const localStart = record.item.id === normalized.start.itemId ? normalized.start.offset : 0;
      const localEnd = record.item.id === normalized.end.itemId
        ? normalized.end.offset
        : record.bodyText.length;
      if (localEnd >= localStart) {
        selected.push(extractTextSelection({
          text: record.bodyText,
          selection: { startOffset: localStart, endOffsetExclusive: localEnd },
          sanitize: false
        }) ?? '');
      }
    }
  }
  return selected.join('\n');
}

function normalizedSelection(
  history: ScrollbackHistory,
  selection: ScrollbackSelection
): {
  readonly start: ScrollbackBodyAnchor;
  readonly end: ScrollbackBodyAnchor;
  readonly startRecord: ScrollbackHistoryRecord;
  readonly endRecord: ScrollbackHistoryRecord;
} | undefined {
  const anchorRecord = scrollbackHistoryRecordById(history, selection.anchor.itemId);
  const focusRecord = scrollbackHistoryRecordById(history, selection.focus.itemId);
  if (anchorRecord === undefined || focusRecord === undefined) return undefined;
  const anchor = boundedAnchor(anchorRecord, selection.anchor);
  const focus = boundedAnchor(focusRecord, selection.focus);
  const anchorFirst = anchorRecord.itemIndex < focusRecord.itemIndex
    || anchorRecord.itemIndex === focusRecord.itemIndex && anchor.offset <= focus.offset;
  return anchorFirst
    ? { start: anchor, end: focus, startRecord: anchorRecord, endRecord: focusRecord }
    : { start: focus, end: anchor, startRecord: focusRecord, endRecord: anchorRecord };
}

function boundedAnchor(
  record: ScrollbackHistoryRecord,
  anchor: ScrollbackBodyAnchor
): ScrollbackBodyAnchor {
  return {
    itemId: record.item.id,
    offset: Math.max(0, Math.min(record.bodyText.length, Math.floor(anchor.offset)))
  };
}
