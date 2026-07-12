import type { ElementOptions } from '../../element/metadata.ts';

export type AuthoredProps<TOptions extends ElementOptions> = Omit<
  TOptions,
  keyof ElementOptions | 'keys'
>;

export type ReplaceProps<TProps, TKeys extends keyof TProps, TReplacement> =
  Omit<TProps, TKeys> & TReplacement;
