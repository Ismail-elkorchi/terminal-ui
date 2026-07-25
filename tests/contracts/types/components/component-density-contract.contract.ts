import { table, type ComponentDensity } from '@ismail-elkorchi/terminal-ui/components';

const compact: ComponentDensity = 'compact';
const regular: ComponentDensity = 'regular';
table({
  id: 'jobs',
  rows: [{ id: 'one' }],
  getRowId: (row) => row.id,
  density: compact
});
table({
  id: 'regular-jobs',
  rows: [{ id: 'one' }],
  getRowId: (row) => row.id,
  density: regular
});
