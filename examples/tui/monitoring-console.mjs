import { renderFramePlain, renderWidgetFrame, spinnerReducer } from '@ismail-elkorchi/terminal-ui/tui';
import { barChart, chart, row, spinner, stack, statusBar } from '@ismail-elkorchi/terminal-ui/widgets';

let spinnerState = { frameIndex: 0, status: 'running' };

const frames = [];
for (let frame = 0; frame < 3; frame += 1) {
  frames.push(`Frame ${String(frame)}\n${renderFramePlain(renderWidgetFrame(view(spinnerState), { columns: 60, rows: 10 }))}`);
  spinnerState = spinnerReducer(spinnerState, { kind: 'advance' }, { frameCount: 10 });
}

console.log(frames.join('\n\n'));

function view(currentSpinnerState) {
  return stack([
    statusBar({ id: 'status', text: 'cluster healthy' }),
    spinner({
      id: 'refresh',
      label: 'Refreshing telemetry',
      frameIndex: currentSpinnerState.frameIndex,
      status: currentSpinnerState.status
    }),
    row([
      barChart({
        id: 'requests',
        items: [
          { label: 'api', value: 80 },
          { label: 'worker', value: 45 },
          { label: 'queue', value: 20 }
        ],
        selected: 0
      }),
      chart({
        id: 'latency',
        series: [{ id: 'p95', label: 'p95', points: [2, 4, 3, 6, 5, 8] }]
      })
    ])
  ]);
}
