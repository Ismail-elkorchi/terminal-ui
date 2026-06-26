import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/schemas/', import.meta.url), { recursive: true });
await cp(new URL('../schemas/', import.meta.url), new URL('../dist/schemas/', import.meta.url), {
  recursive: true
});
