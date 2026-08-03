import type { AccessibleNode, AccessibleSnapshot } from '../accessibility/index.ts';
import {
  terminalDiagnosticFromContent
} from '../diagnostics.ts';
import type {
  DiagnosticOccurrence,
  TerminalDiagnostic,
  TerminalDiagnosticValue
} from '../diagnostics.ts';
import type { JsonValue } from '../foundation/json.ts';
import type { TerminalRestoreResult } from '../host/index.ts';
import type { InputEvent } from '../input/index.ts';
import type {
  CursorPosition,
  Frame,
  FrameCell,
  FrameHitTarget,
  RenderDiff,
  RenderOperation
} from '../renderer/index.ts';
import {
  applyRenderDiff
} from '../renderer/internal/diff-interpreter.ts';
import type { RenderDiffProjection } from '../renderer/internal/diff-interpreter.ts';
import { measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { FrameCellSource, RenderSpan, TerminalLink } from '../visual/index.ts';
import type {
  InteractionTranscript,
  InteractionTranscriptStep,
  RedactionPolicy,
  TranscriptRedaction,
  TranscriptRuntimeCommit
} from './types.ts';

interface RedactionContext {
  readonly secrets: readonly string[];
  readonly replacement: string;
  readonly identifierReplacement: string;
  readonly redactions: TranscriptRedaction[];
  readonly redactedPaths: Set<string>;
  readonly identifiers: Map<string, string>;
  readonly reservedValues: Set<string>;
  readonly assignedIdentifiers: Set<string>;
  projection?: RenderDiffProjection;
}

export function redactTranscript(
  transcript: InteractionTranscript,
  policy: RedactionPolicy = {}
): InteractionTranscript {
  const secrets = policy.secrets?.filter((secret) => secret.length > 0) ?? [];
  if (secrets.length === 0) return transcript;
  const replacement = resolveRedactionReplacement(policy.replacement, secrets);

  const redactions: TranscriptRedaction[] = [];
  const context: RedactionContext = {
    secrets,
    replacement,
    identifierReplacement: replacement.length > 0
      ? replacement
      : defaultRedactionReplacement(secrets),
    redactions,
    redactedPaths: new Set(),
    identifiers: new Map(),
    reservedValues: collectStringValues(transcript),
    assignedIdentifiers: new Set()
  };
  for (const redaction of transcript.redactions) {
    const path = replaceSecrets(redaction.path, context);
    redactions.push({ ...redaction, path });
    context.redactedPaths.add(path);
  }

  const redactedStartedAt = transcript.startedAt === undefined
    ? undefined
    : redactString(transcript.startedAt, '$.startedAt', context);

  return {
    formatVersion: transcript.formatVersion,
    id: redactIdentifier(transcript.id, '$.id', context),
    source: transcript.source,
    ...(transcript.startedAt !== undefined && redactedStartedAt === transcript.startedAt
      ? { startedAt: redactedStartedAt }
      : {}),
    steps: transcript.steps.map((step, index) =>
      redactStep(step, `$.steps[${String(index)}]`, context)),
    diagnostics: transcript.diagnostics.map((occurrence, index) =>
      redactOccurrence(occurrence, `$.diagnostics[${String(index)}]`, context)),
    redactions
  };
}

function redactStep(
  step: InteractionTranscriptStep,
  path: string,
  context: RedactionContext
): InteractionTranscriptStep {
  switch (step.kind) {
    case 'input':
      return {
        ...step,
        event: redactInputEvent(step.event, `${path}.event`, context)
      };
    case 'message':
      return {
        ...step,
        message: redactJsonValue(step.message, `${path}.message`, context)
      };
    case 'commit':
      return {
        ...step,
        commit: redactCommit(step.commit, `${path}.commit`, context)
      };
    case 'snapshot':
      return {
        ...step,
        snapshot: redactSnapshot(step.snapshot, `${path}.snapshot`, context)
      };
    case 'diagnostic':
      return {
        ...step,
        occurrence: redactOccurrence(step.occurrence, `${path}.occurrence`, context)
      };
    case 'restore':
      return {
        ...step,
        result: redactRestoreResult(step.result, `${path}.result`, context)
      };
  }
}

function redactInputEvent(
  event: InputEvent,
  path: string,
  context: RedactionContext
): InputEvent {
  switch (event.kind) {
    case 'key':
      return {
        ...event,
        ...(event.sequence === undefined
          ? {}
          : { sequence: redactString(event.sequence, `${path}.sequence`, context) }),
        ...(event.committedText === undefined
          ? {}
          : {
              committedText: redactString(
                event.committedText,
                `${path}.committedText`,
                context
              )
            })
      };
    case 'text':
    case 'paste':
      return {
        ...event,
        text: redactString(event.text, `${path}.text`, context)
      };
    case 'mouse':
      return {
        ...event,
        sequence: redactString(event.sequence, `${path}.sequence`, context)
      };
    case 'unknown':
      return {
        ...event,
        sequence: redactString(event.sequence, `${path}.sequence`, context)
      };
    case 'signal':
      return {
        ...event,
        signal: redactString(event.signal, `${path}.signal`, context)
      };
    case 'resize':
    case 'focus':
    case 'end':
      return event;
  }
}

function redactCommit(
  commit: TranscriptRuntimeCommit,
  path: string,
  context: RedactionContext
): TranscriptRuntimeCommit {
  const diff = redactDiff(commit.diff, `${path}.diff`, context);
  const projection = applyRenderDiff(context.projection, diff);
  context.projection = projection;

  const cells = projection.cells;
  for (const [index, cell] of commit.frame.cells.entries()) {
    const projected = cells[index];
    if (projected !== undefined) {
      recordFrameCellChanges(
        cell,
        projected,
        `${path}.frame.cells[${String(index)}]`,
        context
      );
    }
  }

  return {
    ...commit,
    id: redactIdentifier(commit.id, `${path}.id`, context),
    ...(commit.focusPath === undefined
      ? {}
      : { focusPath: redactFocusPath(commit.focusPath, `${path}.focusPath`, context) }),
    frame: redactFrame(commit.frame, cells, `${path}.frame`, context),
    diff
  };
}

function redactFrame(
  frame: Frame,
  cells: readonly FrameCell[],
  path: string,
  context: RedactionContext
): Frame {
  return {
    ...frame,
    cells,
    ...(frame.hitTargets === undefined
      ? {}
      : {
          hitTargets: frame.hitTargets.map((target, index) =>
            redactHitTarget(target, `${path}.hitTargets[${String(index)}]`, context))
        }),
    ...(frame.cursor === undefined
      ? {}
      : { cursor: redactCursor(frame.cursor, `${path}.cursor`, context) }),
    ...(frame.focusPath === undefined
      ? {}
      : { focusPath: redactFocusPath(frame.focusPath, `${path}.focusPath`, context) }),
    accessibility: redactSnapshot(frame.accessibility, `${path}.accessibility`, context)
  };
}

function redactDiff(
  diff: RenderDiff,
  path: string,
  context: RedactionContext
): RenderDiff {
  return {
    ...diff,
    operations: diff.operations.map((operation, index) =>
      redactOperation(
        operation,
        `${path}.operations[${String(index)}]`,
        diff.widthProfile,
        context
      )),
    ...(diff.cursor === undefined
      ? {}
      : { cursor: redactCursor(diff.cursor, `${path}.cursor`, context) })
  };
}

function redactOperation(
  operation: RenderOperation,
  path: string,
  widthProfile: TextWidthProfile,
  context: RedactionContext
): RenderOperation {
  if (operation.kind === 'clearRect') return operation;
  return {
    ...operation,
    spans: operation.spans.map((span, index) =>
      redactSpan(
        span,
        `${path}.spans[${String(index)}]`,
        widthProfile,
        context
      ))
  };
}

function redactSpan(
  span: RenderSpan,
  path: string,
  widthProfile: TextWidthProfile,
  context: RedactionContext
): RenderSpan {
  return {
    ...span,
    text: redactRenderedText(span.text, `${path}.text`, widthProfile, context),
    ...(span.link === undefined
      ? {}
      : { link: redactLink(span.link, `${path}.link`, context) }),
    ...(span.source === undefined
      ? {}
      : { source: redactFrameSource(span.source, `${path}.source`, context) })
  };
}

function redactCursor(
  cursor: CursorPosition,
  path: string,
  context: RedactionContext
): CursorPosition {
  return {
    ...cursor,
    ...(cursor.source === undefined
      ? {}
      : { source: redactFrameSource(cursor.source, `${path}.source`, context) })
  };
}

function redactHitTarget(
  target: FrameHitTarget,
  path: string,
  context: RedactionContext
): FrameHitTarget {
  return {
    ...target,
    id: redactIdentifier(target.id, `${path}.id`, context),
    ...(target.focus?.kind === 'focus'
      ? {
          focus: {
            ...target.focus,
            path: redactFocusPath(target.focus.path, `${path}.focus.path`, context)
          }
        }
      : {})
  };
}

function redactFocusPath(
  focusPath: readonly string[],
  path: string,
  context: RedactionContext
): readonly string[] {
  return focusPath.map((segment, index) =>
    redactIdentifier(segment, `${path}[${String(index)}]`, context));
}

function redactLink(
  link: TerminalLink,
  path: string,
  context: RedactionContext
): TerminalLink {
  return {
    ...link,
    href: redactString(link.href, `${path}.href`, context),
    ...(link.id === undefined
      ? {}
      : { id: redactIdentifier(link.id, `${path}.id`, context) })
  };
}

function redactFrameSource(
  source: FrameCellSource,
  path: string,
  context: RedactionContext
): FrameCellSource {
  return {
    ...source,
    ...(source.elementId === undefined
      ? {}
      : { elementId: redactIdentifier(source.elementId, `${path}.elementId`, context) }),
    ...(source.elementKind === undefined
      ? {}
      : { elementKind: redactString(source.elementKind, `${path}.elementKind`, context) }),
    ...(source.rendererFamily === undefined
      ? {}
      : {
          rendererFamily: redactString(
            source.rendererFamily,
            `${path}.rendererFamily`,
            context
          )
        }),
    ...(source.partName === undefined
      ? {}
      : { partName: redactString(source.partName, `${path}.partName`, context) }),
    ...(source.partType === undefined
      ? {}
      : { partType: redactString(source.partType, `${path}.partType`, context) }),
    ...(source.itemId === undefined
      ? {}
      : { itemId: redactIdentifier(source.itemId, `${path}.itemId`, context) }),
    ...(source.description === undefined
      ? {}
      : { description: redactString(source.description, `${path}.description`, context) })
  };
}

function redactSnapshot(
  snapshot: AccessibleSnapshot,
  path: string,
  context: RedactionContext
): AccessibleSnapshot {
  return {
    ...snapshot,
    ...(snapshot.title === undefined
      ? {}
      : { title: redactString(snapshot.title, `${path}.title`, context) }),
    root: redactAccessibleNode(snapshot.root, `${path}.root`, context),
    focusPath: redactFocusPath(snapshot.focusPath, `${path}.focusPath`, context),
    diagnostics: snapshot.diagnostics.map((item, index) =>
      redactDiagnostic(item, `${path}.diagnostics[${String(index)}]`, context))
  };
}

function redactAccessibleNode(
  node: AccessibleNode,
  path: string,
  context: RedactionContext
): AccessibleNode {
  return {
    ...node,
    id: redactIdentifier(node.id, `${path}.id`, context),
    ...(node.label === undefined
      ? {}
      : { label: redactString(node.label, `${path}.label`, context) }),
    ...(typeof node.value !== 'string'
      ? {}
      : { value: redactString(node.value, `${path}.value`, context) }),
    ...(node.position === undefined
      ? {}
      : {
          position: {
            ...node.position,
            ...(node.position.columnLabel === undefined
              ? {}
              : {
                  columnLabel: redactString(
                    node.position.columnLabel,
                    `${path}.position.columnLabel`,
                    context
                  )
                }),
            ...(node.position.group === undefined
              ? {}
              : {
                  group: redactString(
                    node.position.group,
                    `${path}.position.group`,
                    context
                  )
                })
          }
        }),
    ...(node.description === undefined
      ? {}
      : { description: redactString(node.description, `${path}.description`, context) }),
    ...(node.controls === undefined
      ? {}
      : { controls: redactIdentifier(node.controls, `${path}.controls`, context) }),
    ...(node.labelledBy === undefined
      ? {}
      : { labelledBy: redactIdentifier(node.labelledBy, `${path}.labelledBy`, context) }),
    ...(node.children === undefined
      ? {}
      : {
          children: node.children.map((child, index) =>
            redactAccessibleNode(child, `${path}.children[${String(index)}]`, context))
        })
  };
}

function redactOccurrence(
  occurrence: DiagnosticOccurrence,
  path: string,
  context: RedactionContext
): DiagnosticOccurrence {
  const owner = redactIdentifier(occurrence.owner, `${path}.owner`, context);
  const id = `${owner}:diagnostic:${String(occurrence.sequence)}`;
  if (id !== occurrence.id) recordRedaction(`${path}.id`, context);
  return {
    ...occurrence,
    id,
    owner,
    diagnostic: redactDiagnostic(occurrence.diagnostic, `${path}.diagnostic`, context)
  };
}

function redactDiagnostic(
  value: TerminalDiagnostic,
  path: string,
  context: RedactionContext
): TerminalDiagnostic {
  return terminalDiagnosticFromContent({
    code: value.code,
    severity: value.severity,
    message: redactString(value.message, `${path}.message`, context),
    ...(value.target === undefined
      ? {}
      : { target: redactString(value.target, `${path}.target`, context) }),
    ...(value.cause === undefined
      ? {}
      : {
          cause: redactJsonValue(
            value.cause,
            `${path}.cause`,
            context
          )
        }),
    ...(value.hint === undefined
      ? {}
      : { hint: redactString(value.hint, `${path}.hint`, context) }),
    ...(value.data === undefined
      ? {}
      : {
          data: redactJsonValue(
            value.data,
            `${path}.data`,
            context
          ) as Readonly<Record<string, TerminalDiagnosticValue>>
        })
  });
}

function redactRestoreResult(
  result: TerminalRestoreResult,
  path: string,
  context: RedactionContext
): TerminalRestoreResult {
  return {
    ...result,
    diagnostics: result.diagnostics.map((item, index) =>
      redactDiagnostic(item, `${path}.diagnostics[${String(index)}]`, context))
  };
}

function redactJsonValue(
  value: JsonValue,
  path: string,
  context: RedactionContext
): JsonValue {
  if (typeof value === 'string') return redactString(value, path, context);
  if (isJsonArray(value)) {
    return value.map((item, index) =>
      redactJsonValue(item, `${path}[${String(index)}]`, context));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    const reservedKeys = new Set(entries.map(([key]) => key));
    const assignedKeys = new Set<string>();
    return Object.fromEntries(entries.map(([key, item]) => {
      const redactedKey = redactJsonKey(key, reservedKeys, assignedKeys, context);
      const itemPath = `${path}[${JSON.stringify(redactedKey)}]`;
      if (redactedKey !== key) recordRedaction(itemPath, context);
      return [redactedKey, redactJsonValue(item, itemPath, context)];
    }));
  }
  return value;
}

function redactJsonKey(
  key: string,
  reservedKeys: ReadonlySet<string>,
  assignedKeys: Set<string>,
  context: RedactionContext
): string {
  const redacted = replaceSecrets(key, context);
  if (redacted === key) {
    assignedKeys.add(key);
    return key;
  }
  return uniqueRedactedValue(redacted, reservedKeys, assignedKeys, context);
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function redactRenderedText(
  value: string,
  path: string,
  widthProfile: TextWidthProfile,
  context: RedactionContext
): string {
  let next = value;
  let changed = false;
  for (const secret of context.secrets) {
    if (!next.includes(secret)) continue;
    const secretWidth = measureTextCells(secret, { widthProfile }).cells;
    next = next.split(secret).join(redactionMask(secretWidth, widthProfile, context));
    changed = true;
  }
  if (!changed) return value;

  const width = measureTextCells(value, { widthProfile }).cells;
  if (
    measureTextCells(next, { widthProfile }).cells !== width
    || containsConfiguredSecret(next, context.secrets)
  ) {
    next = redactionMask(width, widthProfile, context);
  }
  recordRedaction(path, context);
  return next;
}

function redactionMask(
  cells: number,
  widthProfile: TextWidthProfile,
  context: RedactionContext
): string {
  if (cells === 0) return '';
  for (const candidate of [context.replacement, '*', '#', '?', 'x', '~', '\u2588']) {
    const measurement = measureTextCells(candidate, { widthProfile });
    if (measurement.graphemes.length !== 1 || measurement.cells !== 1) continue;
    const mask = candidate.repeat(cells);
    if (context.secrets.every((secret) => !mask.includes(secret))) return mask;
  }
  throw new TypeError('No safe terminal-cell redaction mask is available.');
}

function redactIdentifier(
  value: string,
  path: string,
  context: RedactionContext
): string {
  const redacted = redactString(value, path, context);
  if (redacted === value) return value;

  const existing = context.identifiers.get(value);
  if (existing !== undefined) return existing;

  const base = redacted.length > 0 ? redacted : context.identifierReplacement;
  const candidate = uniqueRedactedValue(
    base,
    context.reservedValues,
    context.assignedIdentifiers,
    context
  );
  context.identifiers.set(value, candidate);
  return candidate;
}

function uniqueRedactedValue(
  base: string,
  reserved: ReadonlySet<string>,
  assigned: Set<string>,
  context: RedactionContext
): string {
  if (!reserved.has(base) && !assigned.has(base)) {
    assigned.add(base);
    return base;
  }

  const separators = ['#', '~', '_', '-', '.', ':', '/', '+', '=', context.identifierReplacement];
  const maximumOrdinal = reserved.size + assigned.size + 1;
  for (let ordinal = 1; ordinal <= maximumOrdinal; ordinal += 1) {
    for (const separator of separators) {
      const candidate = `${base}${separator}${String(ordinal)}`;
      if (
        !containsConfiguredSecret(candidate, context.secrets)
        && !reserved.has(candidate)
        && !assigned.has(candidate)
      ) {
        assigned.add(candidate);
        return candidate;
      }
    }
  }
  throw new TypeError('No safe unique redacted value is available.');
}

function redactString(
  value: string,
  path: string,
  context: RedactionContext
): string {
  const next = replaceSecrets(value, context);
  if (next !== value) recordRedaction(path, context);
  return next;
}

function replaceSecrets(value: string, context: RedactionContext): string {
  let next = value;
  for (const secret of context.secrets) {
    if (next.includes(secret)) next = next.split(secret).join(context.replacement);
  }
  return containsConfiguredSecret(next, context.secrets)
    ? context.replacement
    : next;
}

function resolveRedactionReplacement(
  replacement: string | undefined,
  secrets: readonly string[]
): string {
  if (replacement === undefined) return defaultRedactionReplacement(secrets);
  if (typeof replacement !== 'string') {
    throw new TypeError('Transcript redaction replacement must be a string.');
  }
  if (sanitizeTerminalText(replacement).changed) {
    throw new TypeError(
      'Transcript redaction replacement must not contain control characters or terminal sequences.'
    );
  }
  if (containsConfiguredSecret(replacement, secrets)) {
    throw new TypeError('Transcript redaction replacement must not contain a configured secret.');
  }
  return replacement;
}

function defaultRedactionReplacement(secrets: readonly string[]): string {
  for (const candidate of ['[redacted]', '[removed]', '*', '#', '?', '~', '\u2588']) {
    if (!containsConfiguredSecret(candidate, secrets)) return candidate;
  }
  throw new TypeError('No safe transcript redaction replacement is available.');
}

function containsConfiguredSecret(value: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => value.includes(secret));
}

function recordFrameCellChanges(
  original: FrameCell,
  redacted: FrameCell,
  path: string,
  context: RedactionContext
): void {
  recordChangedString(original.text, redacted.text, `${path}.text`, context);
  recordLinkChanges(original.link, redacted.link, `${path}.link`, context);
  recordSourceChanges(original.source, redacted.source, `${path}.source`, context);
}

function recordLinkChanges(
  original: TerminalLink | undefined,
  redacted: TerminalLink | undefined,
  path: string,
  context: RedactionContext
): void {
  recordChangedString(original?.href, redacted?.href, `${path}.href`, context);
  recordChangedString(original?.id, redacted?.id, `${path}.id`, context);
}

function recordSourceChanges(
  original: FrameCellSource | undefined,
  redacted: FrameCellSource | undefined,
  path: string,
  context: RedactionContext
): void {
  for (const field of [
    'elementId',
    'elementKind',
    'rendererFamily',
    'partName',
    'partType',
    'itemId',
    'description'
  ] as const) {
    recordChangedString(original?.[field], redacted?.[field], `${path}.${field}`, context);
  }
}

function recordChangedString(
  original: string | undefined,
  redacted: string | undefined,
  path: string,
  context: RedactionContext
): void {
  if (original !== redacted) recordRedaction(path, context);
}

function recordRedaction(path: string, context: RedactionContext): void {
  if (context.redactedPaths.has(path)) return;
  context.redactedPaths.add(path);
  context.redactions.push({ path, reason: 'secret' });
}

function collectStringValues(root: unknown): Set<string> {
  const values = new Set<string>();
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      values.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value as readonly unknown[]) pending.push(item);
    } else if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) pending.push(item);
    }
  }
  return values;
}
