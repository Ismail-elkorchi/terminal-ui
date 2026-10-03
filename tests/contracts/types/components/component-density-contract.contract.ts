import { createTableCollection } from '@ismail-elkorchi/terminal-ui/behavior';
import { inferTableColumns } from '@ismail-elkorchi/terminal-ui/components';
import { button, table, type ComponentDensity } from '@ismail-elkorchi/terminal-ui/components';
import { ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';

const compact: ComponentDensity = 'compact';
const regular: ComponentDensity = 'regular';
table({
  columns: inferTableColumns([{ id: 'one' }]),
  id: 'jobs',
  collection: createTableCollection([{ id: 'one' }], (row) => row.id),
  density: compact
});
table({
  columns: inferTableColumns([{ id: 'one' }]),
  id: 'regular-jobs',
  collection: createTableCollection([{ id: 'one' }], (row) => row.id),
  density: regular
});
button({ id: 'compact-action', label: 'Save', density: compact, onPress: ignoreMessage });
button({ id: 'regular-action', label: 'Save', density: regular, onPress: ignoreMessage });
