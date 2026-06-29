import type { FrameCell } from '../frame.ts';
import type { FramePass } from './frame-pass.ts';

type Direction = 'up' | 'right' | 'down' | 'left';
type GlyphFamily = 'single' | 'double' | 'heavy' | 'ascii';

interface GlyphShape {
  readonly family: GlyphFamily;
  readonly directions: readonly Direction[];
}

export const boxDrawingJoinPass: FramePass = {
  id: 'box-drawing-join',
  apply(buffer) {
    const cells = buffer.snapshot().cells;
    const index = new Map(cells.map((cell) => [cellKey(cell.row, cell.column), cell]));

    for (const cell of cells) {
      if (!isMergeableCell(cell)) continue;
      const shape = shapeForGlyph(cell.text);
      if (shape === undefined) continue;
      const directions = joinedDirections(cell, shape, index);
      const glyph = glyphForDirections(shape.family, directions);
      if (glyph === undefined || glyph === cell.text) continue;
      buffer.writeCell({ ...cell, text: glyph, width: 1 });
    }
  }
};

function joinedDirections(
  cell: FrameCell,
  shape: GlyphShape,
  index: ReadonlyMap<string, FrameCell>
): readonly Direction[] {
  const directions = new Set(shape.directions);
  for (const direction of allDirections) {
    const neighbor = neighborCell(cell, direction, index);
    if (neighbor === undefined || !isMergeableCell(neighbor)) continue;
    const neighborShape = shapeForGlyph(neighbor.text);
    if (neighborShape?.directions.includes(oppositeDirection(direction)) === true) directions.add(direction);
  }
  return allDirections.filter((direction) => directions.has(direction));
}

function neighborCell(
  cell: FrameCell,
  direction: Direction,
  index: ReadonlyMap<string, FrameCell>
): FrameCell | undefined {
  const row = direction === 'up' ? cell.row - 1 : direction === 'down' ? cell.row + 1 : cell.row;
  const column = direction === 'left' ? cell.column - 1 : direction === 'right' ? cell.column + 1 : cell.column;
  return index.get(cellKey(row, column));
}

function isMergeableCell(cell: FrameCell): boolean {
  return cell.continuation !== true
    && cell.width === 1
    && (cell.source?.role === 'border' || cell.source?.role === 'separator');
}

function shapeForGlyph(glyph: string): GlyphShape | undefined {
  return glyphShapes.get(glyph);
}

function glyphForDirections(family: GlyphFamily, directions: readonly Direction[]): string | undefined {
  const key = directionKey(directions);
  const glyphs = familyGlyphs[family];
  return glyphs.get(key);
}

function oppositeDirection(direction: Direction): Direction {
  if (direction === 'up') return 'down';
  if (direction === 'down') return 'up';
  if (direction === 'left') return 'right';
  return 'left';
}

function cellKey(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}

function directionKey(directions: readonly Direction[]): string {
  return allDirections.filter((direction) => directions.includes(direction)).join(',');
}

const allDirections: readonly Direction[] = ['up', 'right', 'down', 'left'];

const singleGlyphs = glyphMap([
  ['right,left', '─'],
  ['up,down', '│'],
  ['right,down', '┌'],
  ['down,left', '┐'],
  ['up,right', '└'],
  ['up,left', '┘'],
  ['right,down,left', '┬'],
  ['up,right,left', '┴'],
  ['up,down,left', '┤'],
  ['up,right,down', '├'],
  ['up,right,down,left', '┼']
]);

const doubleGlyphs = glyphMap([
  ['right,left', '═'],
  ['up,down', '║'],
  ['right,down', '╔'],
  ['down,left', '╗'],
  ['up,right', '╚'],
  ['up,left', '╝'],
  ['right,down,left', '╦'],
  ['up,right,left', '╩'],
  ['up,down,left', '╣'],
  ['up,right,down', '╠'],
  ['up,right,down,left', '╬']
]);

const heavyGlyphs = glyphMap([
  ['right,left', '━'],
  ['up,down', '┃'],
  ['right,down', '┏'],
  ['down,left', '┓'],
  ['up,right', '┗'],
  ['up,left', '┛'],
  ['right,down,left', '┳'],
  ['up,right,left', '┻'],
  ['up,down,left', '┫'],
  ['up,right,down', '┣'],
  ['up,right,down,left', '╋']
]);

const asciiGlyphs = glyphMap([
  ['right,left', '-'],
  ['up,down', '|'],
  ['right,down', '+'],
  ['down,left', '+'],
  ['up,right', '+'],
  ['up,left', '+'],
  ['right,down,left', '+'],
  ['up,right,left', '+'],
  ['up,down,left', '+'],
  ['up,right,down', '+'],
  ['up,right,down,left', '+']
]);

const familyGlyphs: Record<GlyphFamily, ReadonlyMap<string, string>> = {
  single: singleGlyphs,
  double: doubleGlyphs,
  heavy: heavyGlyphs,
  ascii: asciiGlyphs
};

const glyphShapes = new Map<string, GlyphShape>([
  ...shapeEntries('single', singleGlyphs),
  ...shapeEntries('single', glyphMap([
    ['right,down', '╭'],
    ['down,left', '╮'],
    ['up,right', '╰'],
    ['up,left', '╯']
  ])),
  ...shapeEntries('double', doubleGlyphs),
  ...shapeEntries('heavy', heavyGlyphs),
  ...shapeEntries('ascii', asciiGlyphs)
]);

function glyphMap(entries: readonly (readonly [string, string])[]): ReadonlyMap<string, string> {
  return new Map(entries);
}

function shapeEntries(
  family: GlyphFamily,
  glyphs: ReadonlyMap<string, string>
): readonly (readonly [string, GlyphShape])[] {
  return [...glyphs.entries()].map(([key, glyph]) => [glyph, { family, directions: directionsFromKey(key) }] as const);
}

function directionsFromKey(key: string): readonly Direction[] {
  return key.split(',').filter((direction): direction is Direction => isDirection(direction));
}

function isDirection(value: string): value is Direction {
  return value === 'up' || value === 'right' || value === 'down' || value === 'left';
}
