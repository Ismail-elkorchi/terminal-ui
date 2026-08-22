import type { ComponentInspectionValue } from '../../component/index.ts';
import type { SelectionState } from '../../interaction/collection.ts';
import type { TextSelection } from '../../text/index.ts';
import {
  maximumComponentInspectionArrayLength,
  maximumComponentInspectionStringLength,
} from '../../element/semantic-inspection.ts';
import {
  textDocumentLength,
  textDocumentText,
  type TextDocument,
} from '../../text/index.ts';

export function inspectTextValue(value: string): ComponentInspectionValue {
  return value.length <= maximumComponentInspectionStringLength
    ? value
    : Object.freeze({
        kind: 'text-summary',
        codeUnitLength: value.length,
        truncated: true,
      });
}

export function inspectTextDocumentValue(document: TextDocument): ComponentInspectionValue {
  const codeUnitLength = textDocumentLength(document);
  return codeUnitLength <= maximumComponentInspectionStringLength
    ? textDocumentText(document)
    : Object.freeze({ kind: 'text-summary', codeUnitLength, truncated: true });
}

export function inspectCollectionValues<TValue>(
  values: readonly TValue[],
  project: (value: TValue) => ComponentInspectionValue,
): ComponentInspectionValue {
  return values.length <= maximumComponentInspectionArrayLength
    ? Object.freeze(values.map(project))
    : Object.freeze({ itemCount: values.length, truncated: true });
}

export function inspectSelection(selection: SelectionState): ComponentInspectionValue {
  if (selection.mode === 'none') return Object.freeze({ mode: 'none' });
  if (selection.mode === 'single') {
    return Object.freeze({
      mode: 'single',
      ...(selection.selectionFollowsActive === undefined
        ? {}
        : { selectionFollowsActive: selection.selectionFollowsActive }),
      ...(selection.selectedId === undefined ? {} : { selectedId: selection.selectedId }),
    });
  }
  return Object.freeze({
    mode: 'multiple',
    ...(selection.selectedIds.length <= maximumComponentInspectionArrayLength
      ? { selectedIds: Object.freeze([...selection.selectedIds]) }
      : { selectedCount: selection.selectedIds.length }),
    ...(selection.anchorId === undefined ? {} : { anchorId: selection.anchorId }),
    ...(selection.rangeSelectionEnabled === undefined
      ? {}
      : { rangeSelectionEnabled: selection.rangeSelectionEnabled }),
  });
}

export function inspectTextSelection(selection: TextSelection): ComponentInspectionValue {
  return Object.freeze({
    startOffset: selection.startOffset,
    endOffsetExclusive: selection.endOffsetExclusive,
  });
}

export function inspectValidation(
  required: boolean,
  error: string | undefined,
): { readonly required: boolean; readonly invalid: boolean; readonly message?: string } {
  return Object.freeze({
    required,
    invalid: error !== undefined && error !== '',
    ...(error === undefined || error === '' || error.length > maximumComponentInspectionStringLength
      ? {}
      : { message: error }),
  });
}
