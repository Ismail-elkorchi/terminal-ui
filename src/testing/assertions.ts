import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { FocusAssertion, InteractionResult, SnapshotAssertion } from './types.ts';

export function assertFocus(snapshot: AccessibleSnapshot, assertion: FocusAssertion): void {
  if (!snapshot.focusPath.includes(assertion.id)) {
    throw new Error(`Expected focus path to include ${assertion.id}.`);
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
