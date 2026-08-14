import { runtimeCycleA } from './runtime-cycle-a.ts';

export function runtimeCycleB(): string {
  return runtimeCycleA();
}
