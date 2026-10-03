declare const contributionBrand: unique symbol;
declare const sourceBrand: unique symbol;

/** An immutable, owned update contribution. Forward it whole through result composition. */
export interface TuiContribution<TMessage> {
  readonly [contributionBrand]: TMessage;
}

/** A child-owned subscription. Its lifetime and executable descriptor are private. */
export interface TuiScopedSource<TMessage> {
  readonly [sourceBrand]: TMessage;
}
