export const navigationNodes = Object.freeze([
  {
    id: 'operations',
    label: 'Operations',
    icon: '◆',
    expanded: true,
    children: [
      { id: 'dashboard', label: 'Overview', icon: '▣' },
      { id: 'data', label: 'Fleet board', icon: '▤' },
      { id: 'text', label: 'Briefing room', icon: '¶' },
      { id: 'diagram', label: 'Route map', icon: '◎' },
      { id: 'forms', label: 'Dispatch desk', icon: '☷' },
      { id: 'activity', label: 'Live events', icon: '✦' }
    ]
  }
]);

export const commandEntries = Object.freeze([
  { id: 'dashboard', label: 'Open overview', description: 'Harbor pulse, risk, capacity, and active routes', keywords: ['home', 'metrics'] },
  { id: 'data', label: 'Open fleet board', description: 'Sortable vessel and cargo status table', keywords: ['table', 'assets'] },
  { id: 'text', label: 'Open briefing room', description: 'Editable shift note, rich advisory text, and message log', keywords: ['editor', 'brief'] },
  { id: 'diagram', label: 'Open route map', description: 'Canvas map, layered overlays, and custom signal meter', keywords: ['map', 'canvas'] },
  { id: 'forms', label: 'Open dispatch desk', description: 'Live controls, fields, toggles, select, and dropdown', keywords: ['settings', 'controls'] },
  { id: 'activity', label: 'Open live events', description: 'Structured operations feed with selected event detail', keywords: ['feed', 'events'] },
  { id: 'theme', label: 'Cycle theme', description: 'Switch visual tone without leaving the app', keywords: ['style'] },
  { id: 'modal', label: 'Open handoff wizard', description: 'Modal focus scope for shift handoff', keywords: ['dialog', 'wizard'] }
]);

export const dataRows = Object.freeze([
  { name: 'Aster', type: 'container', status: 'moored', score: 96, owner: 'Rin' },
  { name: 'Atlas', type: 'research', status: 'cleared', score: 89, owner: 'Mira' },
  { name: 'Pulse', type: 'ferry', status: 'watch', score: 72, owner: 'Sam' },
  { name: 'Lumen', type: 'tanker', status: 'cleared', score: 93, owner: 'Ari' },
  { name: 'Vector', type: 'supply', status: 'routing', score: 81, owner: 'Noor' },
  { name: 'Signal', type: 'survey', status: 'holding', score: 68, owner: 'Ilya' }
]);

export const logItems = Object.freeze([
  { id: 'l1', timestamp: '09:00', metadata: { source: 'harbor' }, text: 'north gate opened for Aster, berth 12 assignment confirmed' },
  { id: 'l2', timestamp: '09:01', metadata: { source: 'weather' }, text: 'crosswind easing below advisory threshold across the west lane' },
  { id: 'l3', timestamp: '09:02', metadata: { source: 'dispatch' }, text: 'Vector rerouted through channel C after pilot request' },
  { id: 'l4', timestamp: '09:03', metadata: { source: 'inspection' }, text: 'cold-chain inspection cleared for cargo block 7' },
  { id: 'l5', timestamp: '09:04', metadata: { source: 'signal' }, text: 'AIS beacon cluster restored near outer marker' },
  { id: 'l6', timestamp: '09:05', metadata: { source: 'team' }, text: 'night handoff draft updated with two watch items' },
  { id: 'l7', timestamp: '09:06', metadata: { source: 'terminal' }, text: 'gate crane 4 returned to nominal cycle time' }
]);

export const activityBlocks = Object.freeze([
  {
    id: 'berth',
    title: 'Berth window secured',
    status: 'success',
    summary: 'Aster enters berth 12 inside the active tide window',
    fields: [
      { label: 'pilot', value: 'Rin' },
      { label: 'berth', value: '12' }
    ],
    body: 'Cargo transfer, inspection, and outbound clearance are now staged in sequence.'
  },
  {
    id: 'lane',
    title: 'Lane pressure rising',
    status: 'running',
    summary: 'Ferry wake and supply traffic are sharing channel C',
    fields: [
      { label: 'sector', value: 'west lane' },
      { label: 'watch', value: '14 min' }
    ],
    body: 'Dispatcher is holding one low-priority departure until Vector clears the crossing.'
  },
  {
    id: 'cargo',
    title: 'Cold-chain cleared',
    status: 'info',
    summary: 'Temperature telemetry stayed inside the transfer band',
    fields: [
      { label: 'block', value: '7' },
      { label: 'crew', value: 'Mira' }
    ],
    details: 'The next handoff should keep the final crate group under watch until truck bay release.'
  },
  {
    id: 'weather',
    title: 'Weather advisory easing',
    status: 'warning',
    summary: 'Outer marker gusts remain uneven but trend downward',
    fields: [
      { label: 'gust', value: '18 kt' },
      { label: 'eta', value: '22 min' }
    ]
  }
]);

export const paletteSuggestions = Object.freeze([
  { value: '/palette', label: 'Open palette', description: 'Search all command routes' },
  { value: '/theme', label: 'Cycle theme', description: 'Switch semantic theme tokens' },
  { value: '/handoff', label: 'Open handoff', description: 'Prepare the shift handoff modal' },
  { value: '/fleet', label: 'Open fleet board', description: 'Inspect and select vessels' }
]);
