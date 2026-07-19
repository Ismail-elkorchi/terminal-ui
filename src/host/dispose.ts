import { errorFromUnknown } from '../errors.ts';

export async function settleResourceDisposal(
  operations: readonly (() => void | Promise<void>)[]
): Promise<void> {
  const failures: Error[] = [];
  for (const operation of operations) {
    try {
      await operation();
    } catch (cause) {
      failures.push(errorFromUnknown(cause));
    }
  }
  const firstFailure = failures[0];
  if (failures.length === 1 && firstFailure !== undefined) throw firstFailure;
  if (failures.length > 1) throw new AggregateError(failures, 'Terminal resource disposal failed.');
}
