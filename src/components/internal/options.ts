export function assertKnownOptions(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  component: string
): void {
  for (const field in value) {
    if (Object.hasOwn(value, field) && !fields.includes(field)) {
      throw new TypeError(`${component} options contain unknown field "${field}".`);
    }
  }
}
