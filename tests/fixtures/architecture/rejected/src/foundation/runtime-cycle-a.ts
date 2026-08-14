import { runtimeCycleB } from './runtime-cycle-b.ts';

export function runtimeCycleA(): string {
  return runtimeCycleB();
}
