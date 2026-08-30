import type { CollectionSnapshot } from '../collection/index.ts';
import { createCompleteCollection } from '../collection/index.ts';

const Date = Object.freeze({ now: () => 7 });
const Math = Object.freeze({ random: () => 0.5 });
const process = Object.freeze({ platform: 'fixture' });
const setTimeout = (callback: () => void): void => callback();

export function acceptedArchitectureFixture(): {
  readonly collection: CollectionSnapshot<number>;
  readonly values: readonly unknown[];
} {
  let scheduled = false;
  setTimeout(() => { scheduled = true; });
  return {
    collection: createCompleteCollection([1], (value) => String(value)),
    values: [Date.now(), Math.random(), process.platform, scheduled],
  };
}

export async function loadAllowedCollectionDependency(): Promise<unknown> {
  return import('../collection/index.ts');
}
