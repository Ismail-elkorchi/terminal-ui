import type { Element, ElementChildren, ElementChildrenMessage } from '../element.ts';
import { toRenderNode, toRenderNodes } from '../../render-node/element.ts';
import type { RenderNode } from '../../render-node/index.ts';
import type { RenderNodeLayoutProps } from '../../render-node/props/shared-layout.ts';
import type { LayoutFlowOptions } from '../../tui/regions.ts';

export function renderNodeChildren<const TChildren extends ElementChildren>(
  children: TChildren
): readonly RenderNode<ElementChildrenMessage<TChildren>>[] {
  return toRenderNodes(children);
}

export function assertTrackCount(
  kind: 'row' | 'stack',
  sizes: readonly unknown[] | undefined,
  childCount: number
): void {
  if (sizes !== undefined && sizes.length !== childCount) {
    throw new RangeError(`${kind} sizes length ${String(sizes.length)} must match child count ${String(childCount)}.`);
  }
}

export function layoutProps(options: LayoutFlowOptions): RenderNodeLayoutProps & { readonly gap?: number } {
  return {
    ...(options.gap === undefined ? {} : { gap: options.gap }),
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.margin === undefined ? {} : { margin: options.margin }),
    ...(options.minWidth === undefined ? {} : { minWidth: options.minWidth }),
    ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.justify === undefined ? {} : { justify: options.justify }),
    ...(options.overflow === undefined ? {} : { overflow: options.overflow })
  };
}

export function surfaceLayoutProps(options: Omit<LayoutFlowOptions, 'gap'>): RenderNodeLayoutProps {
  return {
    ...(options.padding === undefined ? {} : { padding: options.padding }),
    ...(options.margin === undefined ? {} : { margin: options.margin }),
    ...(options.minWidth === undefined ? {} : { minWidth: options.minWidth }),
    ...(options.minHeight === undefined ? {} : { minHeight: options.minHeight }),
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
    ...(options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight }),
    ...(options.align === undefined ? {} : { align: options.align }),
    ...(options.justify === undefined ? {} : { justify: options.justify }),
    ...(options.overflow === undefined ? {} : { overflow: options.overflow })
  };
}

export function optionalId(id: string | undefined): { readonly id?: string } {
  return id === undefined ? {} : { id };
}

export function assertSurfaceChild<TMessage>(child: Element<TMessage>): void {
  if (Array.isArray(child)) {
    throw new Error('surface() expects exactly one non-surface child. Compose child content with stack(), row(), grid(), or tabs() before wrapping it in surface().');
  }
  const childNode = toRenderNode(child);
  if (childNode.kind === 'surface') {
    throw new Error('surface() expects exactly one non-surface child. Compose child content with stack(), row(), grid(), or tabs() before wrapping it in surface().');
  }
}

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
  children: Readonly<Record<string, Element<unknown>>>
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
