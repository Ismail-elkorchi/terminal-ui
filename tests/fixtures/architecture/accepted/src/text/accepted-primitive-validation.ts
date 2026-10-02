import { isNonArrayObject } from '../foundation/validation.ts';

export function acceptsPrimitiveValidation(value: unknown): boolean {
  return isNonArrayObject(value);
}
