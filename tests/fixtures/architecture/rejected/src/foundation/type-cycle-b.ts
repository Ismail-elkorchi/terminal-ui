import type { First } from './type-cycle-a.ts';
export interface Second { readonly next?: First }
