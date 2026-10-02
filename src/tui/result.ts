/** Lift one controlled field without dropping effects, cancellation, focus or domain outputs. */
export function liftTuiResult<TParent, TKey extends keyof TParent, TResult extends { readonly state: TParent[TKey] }>(
  parent: TParent,
  field: TKey,
  result: TResult,
): Omit<TResult, 'state'> & { readonly state: TParent } {
  return { ...result, state: Object.is(parent[field], result.state) ? parent : { ...parent, [field]: result.state } };
}
