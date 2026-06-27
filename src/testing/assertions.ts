import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { Frame, FrameCell, FrameHitTarget, TerminalStyle } from '../tui/index.ts';
import type {
  FocusAssertion,
  HitTargetAssertion,
  InteractionResult,
  SelectedAssertion,
  SnapshotAssertion,
  VisibleTextAssertion
} from './types.ts';

export function assertFocus(snapshot: AccessibleSnapshot, assertion: FocusAssertion): void {
  if (!snapshot.focusPath.includes(assertion.id)) {
    throw new Error(`Expected focus path to include ${assertion.id}.`);
  }
}

export function assertVisibleText(frame: Frame, assertion: VisibleTextAssertion): void {
  const plainText = plainFrameText(frame);
  if (!plainText.includes(assertion.text)) {
    throw new Error(`Expected visible frame text to include ${assertion.text}.`);
  }
  if (assertion.styleToken === undefined) return;
  const styleToken = assertion.styleToken;

  const styledText = frame.cells
    .filter((cell) => cell.continuation !== true && styleHasToken(cell.style, styleToken))
    .sort(compareCells)
    .map((cell) => cell.text)
    .join('');
  if (!styledText.includes(assertion.text)) {
    throw new Error(`Expected visible text ${assertion.text} to use style token ${assertion.styleToken}.`);
  }
}

export function assertSelected(snapshot: AccessibleSnapshot, assertion: SelectedAssertion): void {
  const selected = collectAccessibleNodes(snapshot.root).filter((node) => node.selected === true);
  if (selected.length === 0) throw new Error('Expected accessible snapshot to include a selected node.');
  const match = selected.find((node) =>
    (assertion.id === undefined || node.id === assertion.id)
    && (assertion.label === undefined || node.label === assertion.label)
    && (assertion.value === undefined || node.value === assertion.value)
  );
  if (match === undefined) {
    throw new Error('Expected accessible snapshot to include the selected node described by the assertion.');
  }
}

export function assertHitTarget(frame: Frame, assertion: HitTargetAssertion): void {
  const targets = (frame.hitTargets ?? [])
    .filter((target) =>
      targetContains(target, assertion.row, assertion.column)
      && (assertion.id === undefined || target.id === assertion.id)
    )
    .sort((left, right) => (right.zIndex ?? 0) - (left.zIndex ?? 0));
  if (targets.length === 0) {
    throw new Error(`Expected a hit target at row ${String(assertion.row)}, column ${String(assertion.column)}.`);
  }
}

export function assertNoSecretLeak(result: InteractionResult, secret: string): void {
  if (secret.length > 0 && JSON.stringify(result).includes(secret)) {
    throw new Error('Secret leaked in interaction result.');
  }
}

export function assertTerminalRestored(result: InteractionResult): void {
  if (!result.transcript.steps.some((step) => step.kind === 'restore')) {
    throw new Error('Expected interaction transcript to include a restore checkpoint.');
  }
}

export function assertOutput(output: string, includes?: string, excludes?: string): void {
  if (includes !== undefined && !output.includes(includes)) {
    throw new Error(`Expected output to include ${includes}.`);
  }
  if (excludes !== undefined && output.includes(excludes)) {
    throw new Error(`Expected output to exclude ${excludes}.`);
  }
}

export function assertSnapshot(snapshot: AccessibleSnapshot, assertion: SnapshotAssertion): void {
  if (assertion.role !== undefined && snapshot.root.role !== assertion.role) {
    throw new Error(`Expected snapshot root role to be ${assertion.role}.`);
  }
  if (assertion.label !== undefined && snapshot.root.label !== assertion.label) {
    throw new Error(`Expected snapshot root label to be ${assertion.label}.`);
  }
}

function plainFrameText(frame: Frame): string {
  const rows = new Map<number, readonly FrameCell[]>();
  for (const cell of frame.cells) {
    if (cell.continuation === true) continue;
    rows.set(cell.row, [...(rows.get(cell.row) ?? []), cell]);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map((entry) => [...entry[1]].sort(compareCells).map((cell) => cell.text).join(''))
    .join('\n');
}

function styleHasToken(style: TerminalStyle | undefined, token: string): boolean {
  return (style?.fg?.kind === 'theme' && style.fg.token === token)
    || (style?.bg?.kind === 'theme' && style.bg.token === token);
}

function compareCells(left: FrameCell, right: FrameCell): number {
  return left.row - right.row || left.column - right.column;
}

function collectAccessibleNodes(node: AccessibleSnapshot['root']): readonly AccessibleSnapshot['root'][] {
  return [
    node,
    ...(node.children ?? []).flatMap((child) => collectAccessibleNodes(child))
  ];
}

function targetContains(target: FrameHitTarget, row: number, column: number): boolean {
  return row >= target.bounds.row
    && row < target.bounds.row + target.bounds.height
    && column >= target.bounds.column
    && column < target.bounds.column + target.bounds.width;
}
