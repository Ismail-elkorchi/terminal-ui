import { button, text } from '@ismail-elkorchi/terminal-ui/components';
import type { Element } from '@ismail-elkorchi/terminal-ui';
import {
  column,
  grid,
  measuredViewport,
  responsive,
  type LayoutSize
} from '@ismail-elkorchi/terminal-ui/layout';

const fixed: LayoutSize = { kind: 'fixed', cells: 1 };
const content = column([text({ content: 'A' }), text({ content: 'B' })], { sizes: [fixed, { kind: 'fill', weight: 1 }] });
const cells = grid([content], { columns: [fixed], rows: [{ kind: 'fill', weight: 1 }] });
const selected = responsive({ columns: 100, rows: 30 }, {
  narrow: { maxColumns: 79 },
  wide: { minColumns: 80 }
}, {
  narrow: () => text({ content: 'Narrow' }),
  wide: () => cells
});

// @ts-expect-error fixed layout sizes require a numeric cell count
const invalidSize: LayoutSize = { kind: 'fixed', cells: '1' };

void selected;
void invalidSize;

const measured: Element<'press' | 'scroll'> = measuredViewport([
  button({ id: 'entry', label: 'Entry', onPress: () => 'press' as const }),
], { id: 'viewport', onScroll: () => 'scroll' as const });
void measured;
// @ts-expect-error measured viewports are vertically constrained
measuredViewport([], { id: 'horizontal', onScroll: () => 'scroll', scrollbar: { axis: 'horizontal' } });
// @ts-expect-error measured viewports do not accept caller-predicted row metadata
measuredViewport([{ id: 'entry', rows: 2, value: 'Text' }], { id: 'rows', onScroll: () => 'scroll' });
