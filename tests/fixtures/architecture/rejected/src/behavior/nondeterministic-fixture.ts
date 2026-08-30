const random = Math.random;

export function nondeterministicFixture(): number {
  setTimeout(() => undefined, 0);
  return random();
}
