import { diagnostic } from '../diagnostics.ts';
import { errorFromUnknown, TerminalUiError } from '../errors.ts';
import type { TerminalWriteReceipt } from './types.ts';

export function committedTerminalWrite(): TerminalWriteReceipt {
  return { status: 'committed' };
}

export function failedTerminalWrite(target: string, cause: unknown): TerminalWriteReceipt {
  return {
    status: 'failed_before_write',
    diagnostic: diagnostic('HOST_STREAM_CLOSED', 'Terminal output failed before the write started.', {
      target,
      cause: errorFromUnknown(cause)
    })
  };
}

export function indeterminateTerminalWrite(target: string, cause: unknown): TerminalWriteReceipt {
  return {
    status: 'indeterminate',
    diagnostic: diagnostic('HOST_OUTPUT_INDETERMINATE', 'Terminal output may have been partially written.', {
      target,
      cause: errorFromUnknown(cause)
    })
  };
}

export function requireCommittedTerminalWrite(receipt: TerminalWriteReceipt): void {
  if (receipt.status === 'committed') return;
  throw new TerminalWriteError(receipt);
}

export class TerminalWriteError extends TerminalUiError {
  readonly receipt: Exclude<TerminalWriteReceipt, { readonly status: 'committed' }>;

  constructor(receipt: Exclude<TerminalWriteReceipt, { readonly status: 'committed' }>) {
    super(receipt.diagnostic.message, { cause: receipt.diagnostic.cause });
    this.receipt = receipt;
  }
}

export function terminalWriteMayHaveCommitted(cause: unknown): boolean {
  return !(cause instanceof TerminalWriteError) || cause.receipt.status === 'indeterminate';
}
