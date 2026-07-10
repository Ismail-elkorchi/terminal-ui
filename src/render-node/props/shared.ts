import type { ComponentOptions } from '../../components/options/base.ts';

export type AuthoredProps<TOptions extends ComponentOptions> = Omit<
  TOptions,
  keyof ComponentOptions | 'keys'
>;

export type ReplaceProps<TProps, TKeys extends keyof TProps, TReplacement> =
  Omit<TProps, TKeys> & TReplacement;
