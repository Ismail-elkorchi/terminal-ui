import { pathToFileURL } from 'node:url';

import { createTerminalHarness } from '@ismail-elkorchi/terminal-ui/testing';
import { diffFrames, renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import {
  box,
  chart,
  modal,
  progressBar,
  row,
  scrollback,
  spinner,
  stack,
  statusBar,
  text
} from '@ismail-elkorchi/terminal-ui/widgets';

export const animationViewport = { columns: 84, rows: 18 };

const sequenceStates = [
  {
    id: 'frame-00',
    timeMs: 0,
    spinnerFrame: 0,
    progressFrame: 0,
    progressValue: undefined,
    chartPoints: [2, 3, 4, 3, 5, 6],
    logItems: ['booting render loop'],
    modalOpen: false
  },
  {
    id: 'frame-01',
    timeMs: 120,
    spinnerFrame: 1,
    progressFrame: 1,
    progressValue: 24,
    chartPoints: [2, 4, 3, 5, 6, 8],
    logItems: ['booting render loop', 'scheduler tick 1'],
    modalOpen: false
  },
  {
    id: 'frame-02',
    timeMs: 240,
    spinnerFrame: 2,
    progressFrame: 2,
    progressValue: 48,
    chartPoints: [3, 4, 6, 5, 7, 9],
    logItems: ['booting render loop', 'scheduler tick 1', 'chart data appended'],
    modalOpen: true
  },
  {
    id: 'frame-03',
    timeMs: 360,
    spinnerFrame: 3,
    progressFrame: 3,
    progressValue: 72,
    chartPoints: [4, 6, 5, 8, 9, 11],
    logItems: ['scheduler tick 1', 'chart data appended', 'modal opened'],
    modalOpen: true
  },
  {
    id: 'frame-04',
    timeMs: 480,
    spinnerFrame: 4,
    progressFrame: 4,
    progressValue: 100,
    chartPoints: [6, 5, 8, 9, 11, 12],
    logItems: ['chart data appended', 'modal opened', 'sequence complete'],
    modalOpen: false
  }
];

export function animationSequenceFrames() {
  const harness = createTerminalHarness({ viewport: animationViewport });
  const frames = [];
  let previousFrame;
  for (const state of sequenceStates) {
    harness.clock.advance(state.timeMs - harness.clock.now());
    const frame = renderWidgetFrame(animationSequenceView(state), animationViewport);
    const diff = previousFrame === undefined ? undefined : diffFrames(previousFrame, frame);
    harness.recordFrame(frame);
    if (diff !== undefined) harness.recordDiff(diff);
    frames.push({
      id: state.id,
      timeMs: harness.clock.now(),
      frame,
      ...(diff === undefined ? {} : { diff })
    });
    previousFrame = frame;
  }
  return {
    viewport: animationViewport,
    frames,
    transcript: harness.transcript.snapshot()
  };
}

export function animationSequenceView(state) {
  const content = stack([
    statusBar({ id: 'status', text: `Animation sequence ${state.id} at ${String(state.timeMs)}ms` }),
    row([
      box(stack([
        spinner({ id: 'spinner', label: 'Spinner', frameIndex: state.spinnerFrame }),
        progressBar({
          id: 'progress',
          label: state.progressValue === undefined ? 'Streaming' : 'Progress',
          indeterminate: state.progressValue === undefined,
          value: state.progressValue,
          max: 100,
          frame: state.progressFrame,
          showPercentage: true
        }),
        chart({ id: 'chart', series: [{ id: 'live', label: 'Live', points: state.chartPoints }] })
      ]), { id: 'motion', border: { label: 'Motion' } }),
      box(scrollback({
        id: 'log',
        items: state.logItems.map((item, index) => ({ id: `log-${index}`, text: item }))
      }), { id: 'logs', border: { label: 'Scrollback append' } })
    ])
  ]);
  return state.modalOpen
    ? stack([
        content,
        modal(text({ id: 'modal-text', value: 'Modal frame: deterministic open state' }), {
          id: 'sequence-modal',
          title: 'Sequence modal',
          width: 44,
          height: 5
        })
      ])
    : content;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sequence = animationSequenceFrames();
  const lastFrame = sequence.frames.at(-1)?.frame;
  console.log(JSON.stringify({
    frames: sequence.frames.length,
    diffs: sequence.frames.filter((frame) => frame.diff !== undefined).length,
    transcriptSteps: sequence.transcript.steps.length,
    viewport: sequence.viewport
  }, null, 2));
  if (lastFrame !== undefined) {
    console.log('');
    console.log(renderFramePlain(lastFrame));
  }
}
