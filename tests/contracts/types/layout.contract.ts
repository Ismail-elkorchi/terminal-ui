import { text } from '@ismail-elkorchi/terminal-ui/components';
import {
  column,
  grid,
  responsive,
  type LayoutSize
} from '@ismail-elkorchi/terminal-ui/layout';

const fixed: LayoutSize = { kind: 'fixed', cells: 1 };
const content = column([text('A'), text('B')], { sizes: [fixed, { kind: 'fill', weight: 1 }] });
const cells = grid([content], { columns: [fixed], rows: [{ kind: 'fill', weight: 1 }] });
const selected = responsive({ columns: 100, rows: 30 }, {
  narrow: { maxColumns: 79 },
  wide: { minColumns: 80 }
}, {
  narrow: () => text('Narrow'),
  wide: () => cells
});

// @ts-expect-error fixed layout sizes require a numeric cell count
const invalidSize: LayoutSize = { kind: 'fixed', cells: '1' };

void selected;
void invalidSize;
