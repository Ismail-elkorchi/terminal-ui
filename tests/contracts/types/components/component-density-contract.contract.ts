import { button, table, type ComponentDensity } from '@ismail-elkorchi/terminal-ui/components';

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
button({ id: 'compact-action', label: 'Save', density: compact, onPress: () => undefined });
button({ id: 'regular-action', label: 'Save', density: regular, onPress: () => undefined });
