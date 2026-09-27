import type { ComponentInput } from '../../component/contracts.ts';
import { componentScrollbarHitTargets } from '../../component/scrollbar.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { HitTarget } from '../../renderer/contracts.ts';
import { tablePlan, visibleTableTrack } from './layout.ts';
import type { DataGridComponentAction, TableModel } from './model.ts';

export function tableScrollHitTargets(
  input: ComponentInput<TableModel>,
): readonly HitTarget<{ readonly kind: 'scroll'; readonly request: import('../../interaction/scroll.ts').ScrollRequest }>[] {
  if (input.model.scroll === undefined) return Object.freeze([]);
  const plan = tablePlan(input);
  return componentScrollbarHitTargets({
    id: input.id ?? 'table',
    plan: plan.geometry,
    ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
    onScroll: (request) => ({ kind: 'scroll' as const, request }),
  });
}

export function tableHitTargets(
  input: ComponentInput<TableModel>,
): readonly HitTarget<DataGridComponentAction>[] {
  const plan = tablePlan(input);
  const targets: HitTarget<DataGridComponentAction>[] = [];
  if (input.model.semanticRole === 'grid' && plan.headerHeight > 0) {
    input.model.columns.forEach((column, index) => {
      const track = plan.tracks[index];
      if (track === undefined) return;
      const visible = visibleTableTrack(
        track,
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
      );
      if (visible === undefined) return;
      if (column.sortable) {
        targets.push({
          id: `${input.id ?? 'table'}:header:${column.id}:sort`,
          bounds: { row: 0, column: visible.start, width: visible.end - visible.start, height: 1 },
          accepts: ['click'],
          cursor: 'pointer',
          focus: { kind: 'target', targetId: 'self' },
          message: () => ({
            kind: 'transition',
            transition: { kind: 'sortBy', columnId: column.id },
          }),
        });
      }
      if (column.resizable) {
        targets.push({
          id: `${input.id ?? 'table'}:header:${column.id}:resize`,
          bounds: { row: 0, column: visible.end - 1, width: 1, height: 1 },
          accepts: ['pointerDown', 'dragStart', 'drag'],
          cursor: 'pointer',
          focus: { kind: 'target', targetId: 'self' },
          message: (event) =>
            event.button !== 'left' ? ignoreMessage() : ({
              kind: 'transition',
              transition: {
                kind: 'setColumnWidth',
                columnId: column.id,
                width: Math.max(1, track.width + event.column - (event.pressColumn ?? event.column)),
              },
            }),
        });
      }
    });
  }
  if (input.model.semanticRole === 'grid') plan.rows.forEach((row, visibleIndex) => {
    const rowBounds = {
      row: plan.headerHeight + visibleIndex,
      column: 0,
      width: plan.geometry.contentBounds.width,
      height: 1,
    };
    if (input.model.interactionKind === 'row') {
      targets.push({
        id: `${input.id ?? 'table'}:row:${row.id}`,
        bounds: rowBounds,
        accepts: ['pointerDown', 'click'],
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) => {
          if (event.button !== 'left') return ignoreMessage();
          if (event.kind === 'pointerDown') {
            return { kind: 'transition', transition: { kind: 'setActiveRow', rowId: row.id } };
          }
          return event.clickCount === 2
            ? { kind: 'activate', event: { kind: 'activate', target: { kind: 'row', rowId: row.id } } }
            : ignoreMessage();
        },
      });
      return;
    }
    input.model.columns.forEach((column, index) => {
      const track = plan.tracks[index];
      if (track === undefined) return;
      const visible = visibleTableTrack(
        track,
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
      );
      if (visible === undefined) return;
      targets.push({
        id: `${input.id ?? 'table'}:row:${row.id}:cell:${String(column.index)}`,
        bounds: {
          row: rowBounds.row,
          column: visible.start,
          width: visible.end - visible.start,
          height: 1,
        },
        accepts: ['pointerDown', 'click'],
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) => {
          if (event.button !== 'left') return ignoreMessage();
          if (event.kind === 'pointerDown') {
            return {
              kind: 'transition',
              transition: { kind: 'setActiveCell', cell: { rowId: row.id, columnId: column.id } },
            };
          }
          return event.clickCount === 2
            ? {
              kind: 'activate',
              event: { kind: 'activate', target: { kind: 'cell', cell: { rowId: row.id, columnId: column.id } } },
            }
            : ignoreMessage();
        },
      });
    });
  });
  if (input.model.scroll !== undefined) {
    targets.push(
      ...componentScrollbarHitTargets({
        id: input.id ?? 'table',
        plan: plan.geometry,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => ({
          kind: 'transition' as const,
          transition: { kind: 'scroll' as const, request },
        }),
      }),
    );
  }
  return Object.freeze(targets);
}
