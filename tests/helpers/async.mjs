export async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await flushAsync();
  }
  throw new Error('Timed out waiting for condition.');
}

export function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}
