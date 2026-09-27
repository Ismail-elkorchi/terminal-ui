/** Handlers may be retained when a control is statically unavailable. */
export type RetainedCallbacks<TCallbacks> = Partial<Pick<
  TCallbacks,
  Extract<keyof TCallbacks, `on${string}`>
>>;
