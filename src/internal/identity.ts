declare const identityDomain: unique symbol;

export type InternalIdentity<TDomain extends string> = string & {
  readonly [identityDomain]: TDomain;
};

export type RenderNodeId = InternalIdentity<'render-node'>;
export type EffectExecutionId = InternalIdentity<'effect-execution'>;
export type SubscriptionExecutionId = InternalIdentity<'subscription-execution'>;

export function renderNodeId(value: string, label = 'Render node'): RenderNodeId {
  return validatedIdentity(value, label);
}

export function effectExecutionId(value: string): EffectExecutionId {
  return validatedIdentity(value, 'Effect');
}

export function subscriptionExecutionId(value: string): SubscriptionExecutionId {
  return validatedIdentity(value, 'Subscription');
}

function validatedIdentity<TDomain extends string>(value: string, label: string): InternalIdentity<TDomain> {
  if (value.trim().length === 0 || /[\p{Cc}\p{Cs}]/u.test(value)) {
    throw new TypeError(`${label} id must contain visible text without control characters.`);
  }
  return value as InternalIdentity<TDomain>;
}
