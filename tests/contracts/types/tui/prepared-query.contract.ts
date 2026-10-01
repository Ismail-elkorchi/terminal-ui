import { createTuiPreparedQuery, type TuiPreparedQuery, type TuiPreparedQueryMessage } from '../../../../src/tui/index.ts';

const query = createTuiPreparedQuery({
  id: 'query', prepare: async (input: string) => input.length,
  toMessage: (message) => ({ kind: 'query' as const, message }),
});
const requested = query.request({ ...query.init(), result: null, open: true }, 'test');
export const isOpen: boolean = requested.state.open;
export const result: number | null = requested.state.result;
// @ts-expect-error result must not retain the caller's narrower null-only type
export const alwaysNull: null = requested.state.result;
// @ts-expect-error query input is typed
query.request(query.init(), 42);
// @ts-expect-error prepared results are typed
query.update(requested.state, { kind: 'ready', revision: 1, result: 'wrong' });

export const namedQuery: TuiPreparedQuery<string, number, { readonly kind: 'query'; readonly message: TuiPreparedQueryMessage<number> }> = query;
