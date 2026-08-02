export function assertControlContract(
  component: string,
  value: object,
  inactive: boolean,
  requiredHandlers: readonly string[],
  optionalHandlers: readonly string[] = [],
  requiredAlternatives: readonly string[] = []
): void {
  const options = value as Readonly<Record<string, unknown>>;
  const handlerNames = new Set([
    ...requiredHandlers,
    ...optionalHandlers,
    ...requiredAlternatives
  ]);
  for (const handler of handlerNames) {
    if (options[handler] !== undefined && typeof options[handler] !== 'function') {
      throw new TypeError(`${component} ${handler} must be a function when provided.`);
    }
  }
  if (!inactive) {
    for (const handler of requiredHandlers) {
      if (typeof options[handler] !== 'function') {
        throw new TypeError(`${component} requires ${handler} when enabled.`);
      }
    }
    if (
      requiredAlternatives.length > 0
      && !requiredAlternatives.some((handler) => typeof options[handler] === 'function')
    ) {
      throw new TypeError(
        `${component} requires ${requiredAlternatives.join(' or ')} when enabled.`
      );
    }
    return;
  }
  for (const hook of [...handlerNames, 'keys', 'pointer']) {
    if (options[hook] !== undefined) {
      throw new TypeError(`${component} cannot define ${hook} while disabled or pending.`);
    }
  }
}
