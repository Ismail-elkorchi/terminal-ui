export class TerminalUiError extends Error {
  override readonly name: string = 'TerminalUiError';
}

export function errorFromUnknown(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause), { cause });
}
