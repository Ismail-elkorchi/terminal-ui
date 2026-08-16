import type { DiagnosticOccurrence } from '../diagnostics.ts';
import type { InteractionTranscriptStep, TranscriptRedaction } from './types.ts';

export interface TranscriptEvidenceWeight {
  readonly bytes: number;
  readonly jsonNodes: number;
  readonly stringCodeUnits: number;
  readonly cells: number;
  readonly graphics: number;
}

export function transcriptStepWeight(step: InteractionTranscriptStep): TranscriptEvidenceWeight {
  if (step.kind !== 'commit') {
    return { ...jsonEvidenceWeight(step), cells: 0, graphics: 0 };
  }
  return {
    ...jsonEvidenceWeight(step),
    cells: step.commit.frame.cells.length,
    graphics: step.commit.frame.graphics.length + step.commit.diff.graphicOperations.length
  };
}

export function transcriptDiagnosticWeight(value: DiagnosticOccurrence): TranscriptEvidenceWeight {
  return { ...jsonEvidenceWeight(value), cells: 0, graphics: 0 };
}

export function transcriptRedactionWeight(value: TranscriptRedaction): TranscriptEvidenceWeight {
  return { ...jsonEvidenceWeight(value), cells: 0, graphics: 0 };
}

interface JsonEvidenceWeight {
  readonly bytes: number;
  readonly jsonNodes: number;
  readonly stringCodeUnits: number;
}

function jsonEvidenceWeight(value: unknown): JsonEvidenceWeight {
  if (value === null) return { bytes: 4, jsonNodes: 1, stringCodeUnits: 0 };
  if (typeof value === 'boolean') {
    return { bytes: value ? 4 : 5, jsonNodes: 1, stringCodeUnits: 0 };
  }
  if (typeof value === 'number') {
    return { bytes: String(value).length, jsonNodes: 1, stringCodeUnits: 0 };
  }
  if (typeof value === 'string') {
    return { bytes: jsonStringByteLength(value), jsonNodes: 1, stringCodeUnits: value.length };
  }
  if (Array.isArray(value)) {
    let bytes = 2 + Math.max(0, value.length - 1);
    let jsonNodes = 1;
    let stringCodeUnits = 0;
    for (const item of value) {
      const weight = jsonEvidenceWeight(item);
      bytes += weight.bytes;
      jsonNodes += weight.jsonNodes;
      stringCodeUnits += weight.stringCodeUnits;
    }
    return { bytes, jsonNodes, stringCodeUnits };
  }
  if (typeof value !== 'object') {
    throw new TypeError('Transcript evidence weight requires a canonical JSON value.');
  }
  const entries = Object.entries(value);
  let bytes = 2 + Math.max(0, entries.length - 1);
  let jsonNodes = 1;
  let stringCodeUnits = 0;
  for (const [key, item] of entries) {
    const weight = jsonEvidenceWeight(item);
    bytes += jsonStringByteLength(key) + 1 + weight.bytes;
    jsonNodes += weight.jsonNodes;
    stringCodeUnits += key.length + weight.stringCodeUnits;
  }
  return { bytes, jsonNodes, stringCodeUnits };
}

function jsonStringByteLength(value: string): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0x22 || unit === 0x5c || unit === 0x08 || unit === 0x09
      || unit === 0x0a || unit === 0x0c || unit === 0x0d) {
      bytes += 2;
      continue;
    }
    if (unit < 0x20 || (unit >= 0xd800 && unit <= 0xdfff)) {
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          index += 1;
          continue;
        }
      }
      bytes += 6;
      continue;
    }
    bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2 : 3;
  }
  return bytes;
}
