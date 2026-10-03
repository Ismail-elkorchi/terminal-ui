/** A bounded runtime check, never a caller-supplied trust assertion. */
export function isBoundedPrintableAscii(text: string): boolean {
  return text.length <= 2048 && /^[\x20-\x7e]*$/u.test(text);
}
