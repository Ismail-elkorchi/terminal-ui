export interface TerminalUiErrorOptions extends ErrorOptions {
  readonly code?: 'TUI_OVERLOAD' | 'TUI_RUNTIME_FAULT';
  readonly reason?: string;
  readonly limit?: number;
  readonly observed?: number;
}

export class TerminalUiError extends Error {
  override readonly name: string = 'TerminalUiError';
  readonly code: TerminalUiErrorOptions['code'];
  readonly reason: string | undefined;
  readonly limit: number | undefined;
  readonly observed: number | undefined;

  constructor(message: string, options: TerminalUiErrorOptions = {}) {
    super(message, options);
    this.code = options.code;
    this.reason = options.reason;
    this.limit = options.limit;
    this.observed = options.observed;
  }
}

export function errorFromUnknown(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause), { cause });
}
