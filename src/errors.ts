export class TerminalUiError extends Error {
  override readonly name = 'TerminalUiError';
}

export function errorFromUnknown(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause), { cause });
}
