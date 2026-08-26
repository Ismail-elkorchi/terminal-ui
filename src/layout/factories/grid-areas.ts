import type { ElementValue } from '../../element/index.ts';

export function parseGridAreas(source: string): readonly (readonly string[])[] {
  const rows = source
    .trim()
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => row.split(/\s+/u));
  if (rows.length === 0) throw new RangeError('grid areas must contain at least one row.');
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new RangeError('grid areas must contain at least one column.');
  for (const row of rows) {
    if (row.length !== width) throw new RangeError('grid areas must be rectangular.');
    for (const name of row) {
      if (name !== '.' && !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(name)) {
        throw new RangeError(`grid area name "${name}" is invalid.`);
      }
    }
  }
  assertGridAreaRectangles(rows);
  return rows;
}

export function gridAreaNames(template: readonly (readonly string[])[]): readonly string[] {
  const names: string[] = [];
  for (const row of template) {
    for (const name of row) {
      if (name === '.' || names.includes(name)) continue;
      names.push(name);
    }
  }
  return names;
}

export function assertGridAreaChildren(
  areaNames: readonly string[],
  children: Readonly<Record<string, ElementValue>>
): void {
  const names = new Set(areaNames);
  for (const name of areaNames) {
    if (children[name] === undefined) throw new RangeError(`grid is missing child for area "${name}".`);
  }
  for (const name of Object.keys(children)) {
    if (!names.has(name)) throw new RangeError(`grid child "${name}" is not used by the template.`);
  }
}

function assertGridAreaRectangles(template: readonly (readonly string[])[]): void {
  for (const name of gridAreaNames(template)) {
    const cells = template.flatMap((row, rowIndex) =>
      row.map((value, columnIndex) => ({ value, rowIndex, columnIndex })).filter((cell) => cell.value === name)
    );
    const minRow = Math.min(...cells.map((cell) => cell.rowIndex));
    const maxRow = Math.max(...cells.map((cell) => cell.rowIndex));
    const minColumn = Math.min(...cells.map((cell) => cell.columnIndex));
    const maxColumn = Math.max(...cells.map((cell) => cell.columnIndex));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        if (template[row]?.[column] !== name) {
          throw new RangeError(`grid area "${name}" must be rectangular.`);
        }
      }
    }
  }
}
