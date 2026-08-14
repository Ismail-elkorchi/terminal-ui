import { createHash } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256ContentHex(parts: readonly (string | Uint8Array)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    if (typeof part === 'string') hash.update(part, 'utf8');
    else hash.update(part);
  }
  return hash.digest('hex');
}
