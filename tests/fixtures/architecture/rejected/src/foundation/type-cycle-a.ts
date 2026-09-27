import type { Second } from './type-cycle-b.ts';
export interface First { readonly next?: Second }
