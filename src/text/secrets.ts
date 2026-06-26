export const secretRedactionReplacement = '[redacted]';

const secretBearingNames = new Set([
  'api-key',
  'apikey',
  'access-key',
  'access-token',
  'auth-token',
  'bearer-token',
  'credential',
  'credentials',
  'password',
  'passwd',
  'private-key',
  'secret',
  'token'
]);

export function redactSecretLikeText(value: string): string {
  return value
    .replace(
      /\b([A-Za-z_][A-Za-z0-9_-]*=)([^\s,;&]+)/giu,
      (match, prefix: string) => isSecretBearingName(prefix.slice(0, -1))
        ? `${prefix}${secretRedactionReplacement}`
        : match
    )
    .replace(
      /((?:^|\s)--?(?:password|passwd|secret|token|api-key|apikey|access-token|auth-token|bearer-token|private-key|credential|credentials)\s+)([^\s]+)/giu,
      `$1${secretRedactionReplacement}`
    )
    .replace(
      /(--?(?:password|passwd|secret|token|api-key|apikey|access-token|auth-token|bearer-token|private-key|credential|credentials)=)([^\s]+)/giu,
      `$1${secretRedactionReplacement}`
    );
}

export function isSecretBearingName(value: string): boolean {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return secretBearingNames.has(normalized)
    || [...secretBearingNames].some((name) => normalized.endsWith(`-${name}`));
}
