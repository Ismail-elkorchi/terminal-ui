import { extractTextSelection } from '../text/index.ts';
import {
  logHistoryRecordById,
  logHistorySegments,
} from '../ui-model/log-history.ts';
import type { LogHistory, LogHistoryRecord } from '../ui-model/log-history.ts';
import type { LogViewerBodyAnchor, LogViewerSelection } from '../ui-model/log-viewer.ts';

export interface ExtractLogViewerSelectionTextInput {
  readonly history: LogHistory;
  readonly selection?: LogViewerSelection;
}

export function extractLogViewerSelectionText(
  input: ExtractLogViewerSelectionTextInput
): string | undefined {
  if (input.selection === undefined) return undefined;
  const normalized = normalizedSelection(input.history, input.selection);
  if (normalized === undefined) return undefined;
  if (
    normalized.start.entryId === normalized.end.entryId
    && normalized.start.offset === normalized.end.offset
  ) return '';
  const selected: string[] = [];
  for (const segment of logHistorySegments(input.history)) {
    for (const record of segment.records) {
      if (record.entryIndex < normalized.startRecord.entryIndex) continue;
      if (record.entryIndex > normalized.endRecord.entryIndex) return selected.join('\n');
      const localStart = record.entry.id === normalized.start.entryId ? normalized.start.offset : 0;
      const localEnd = record.entry.id === normalized.end.entryId
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
  history: LogHistory,
  selection: LogViewerSelection
): {
  readonly start: LogViewerBodyAnchor;
  readonly end: LogViewerBodyAnchor;
  readonly startRecord: LogHistoryRecord;
  readonly endRecord: LogHistoryRecord;
} | undefined {
  const anchorRecord = logHistoryRecordById(history, selection.anchor.entryId);
  const focusRecord = logHistoryRecordById(history, selection.focus.entryId);
  if (anchorRecord === undefined || focusRecord === undefined) return undefined;
  const anchor = boundedAnchor(anchorRecord, selection.anchor);
  const focus = boundedAnchor(focusRecord, selection.focus);
  const anchorFirst = anchorRecord.entryIndex < focusRecord.entryIndex
    || anchorRecord.entryIndex === focusRecord.entryIndex && anchor.offset <= focus.offset;
  return anchorFirst
    ? { start: anchor, end: focus, startRecord: anchorRecord, endRecord: focusRecord }
    : { start: focus, end: anchor, startRecord: focusRecord, endRecord: anchorRecord };
}

function boundedAnchor(
  record: LogHistoryRecord,
  anchor: LogViewerBodyAnchor
): LogViewerBodyAnchor {
  return {
    entryId: record.entry.id,
    offset: Math.max(0, Math.min(record.bodyText.length, Math.floor(anchor.offset)))
  };
}
