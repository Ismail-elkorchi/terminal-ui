import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const unicodeVersion = '17.0.0';
const sourceUrl = `https://www.unicode.org/Public/${unicodeVersion}/ucd/EastAsianWidth.txt`;
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Unable to fetch ${sourceUrl}: ${response.status}`);
const text = await response.text();
const ranges = { ambiguous: [], wide: [] };

for (const line of text.split('\n')) {
  const match = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(A|F|W)\b/u.exec(line);
  if (match === null) continue;
  const start = Number.parseInt(match[1], 16);
  const end = Number.parseInt(match[2] ?? match[1], 16);
  const target = match[3] === 'A' ? ranges.ambiguous : ranges.wide;
  target.push([start, end]);
}

const output = `// Generated from ${sourceUrl}. Do not edit by hand.\n`
  + `export const unicodeEastAsianWidthVersion = '${unicodeVersion}' as const;\n\n`
  + renderRanges('eastAsianWideRanges', ranges.wide)
  + '\n'
  + renderRanges('eastAsianAmbiguousRanges', ranges.ambiguous);

await writeFile(fileURLToPath(new URL('../src/text/unicode-width-data.ts', import.meta.url)), output);

function renderRanges(name, values) {
  const lines = values.map(([start, end]) => `  [0x${start.toString(16).toUpperCase()}, 0x${end.toString(16).toUpperCase()}],`);
  return `export const ${name}: readonly (readonly [number, number])[] = [\n${lines.join('\n')}\n];\n`;
}
