export function renderNodeId(value: string, label = 'Render node'): string {
  return validatedIdentity(value, label);
}

export function effectExecutionId(value: string): string {
  return validatedIdentity(value, 'Effect');
}

export function subscriptionExecutionId(value: string): string {
  return validatedIdentity(value, 'Subscription');
}

function validatedIdentity(value: string, label: string): string {
  if (value.trim().length === 0 || /[\p{Cc}\p{Cs}]/u.test(value)) {
    throw new TypeError(`${label} id must contain visible text without control characters.`);
  }
  return value;
}
