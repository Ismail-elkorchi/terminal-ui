import type { InteractionTranscript, RedactionPolicy, TranscriptRedaction } from './types.ts';

export function redactTranscript(
  transcript: InteractionTranscript,
  policy: RedactionPolicy = {}
): InteractionTranscript {
  const secrets = policy.secrets?.filter((secret) => secret.length > 0) ?? [];
  if (secrets.length === 0) return transcript;
  const replacement = policy.replacement ?? '[redacted]';
  const redactions: TranscriptRedaction[] = [];
  const redacted = redactValue(transcript, '$', secrets, replacement, redactions) as InteractionTranscript;
  return { ...redacted, redactions };
}

function redactValue(
  value: unknown,
  path: string,
  secrets: readonly string[],
  replacement: string,
  redactions: TranscriptRedaction[]
): unknown {
  if (typeof value === 'string') return redactString(value, path, secrets, replacement, redactions);
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, `${path}[${String(index)}]`, secrets, replacement, redactions));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactValue(item, `${path}.${key}`, secrets, replacement, redactions)
      ])
    );
  }
  return value;
}

function redactString(
  value: string,
  path: string,
  secrets: readonly string[],
  replacement: string,
  redactions: TranscriptRedaction[]
): string {
  let next = value;
  for (const secret of secrets) {
    if (!next.includes(secret)) continue;
    next = next.split(secret).join(replacement);
    redactions.push({ path, reason: 'secret' });
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
