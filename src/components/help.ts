import type { KeyboardBinding } from '../interaction/key-binding.ts';

export interface HelpBinding {
  readonly binding: KeyboardBinding;
  readonly label: string;
}

export interface HelpGroup {
  readonly id: string;
  readonly label?: string;
  readonly bindings: readonly HelpBinding[];
}
