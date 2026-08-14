import type { TerminalHost } from '../host/index.ts';

export type ForbiddenHostDependency = TerminalHost;

export function currentTime(): number {
  const now = Date.now;
  return now();
}

export async function loadHostDynamically(): Promise<typeof import('../host/index.ts')> {
  return import('../host/index.ts');
}
