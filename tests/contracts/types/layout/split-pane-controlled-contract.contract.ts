import { text, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { splitPane, type SplitPaneAction } from '@ismail-elkorchi/terminal-ui/layout';
import {
  createSplitPaneState,
  splitPanePresentation,
  splitPaneReducer
} from '@ismail-elkorchi/terminal-ui/behavior';

const passive = splitPane([text({ content: 'A' }), text({ content: 'B' })], {
  direction: 'horizontal',
  sizes: [{ kind: 'fixed', cells: 4 }, { kind: 'fill' }]
});
const state = splitPaneReducer(
  createSplitPaneState(2),
  { kind: 'resizeBy', deltaShare: 0.05 }
);
const interactive = splitPane([text({ content: 'A' }), text({ content: 'B' })], {
  id: 'panes',
  direction: 'horizontal',
  ...splitPanePresentation(state),
  onAction: (action) => ({ kind: 'split' as const, action })
});

const acceptedPassive: Element = passive;
const acceptedInteractive: Element<{
  readonly kind: 'split';
  readonly action: SplitPaneAction;
}> = interactive;
void [acceptedPassive, acceptedInteractive];

// @ts-expect-error resizable panes require a stable component id
splitPane([text({ content: 'A' }), text({ content: 'B' })], {
  direction: 'horizontal',
  sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
  onAction: (_action: SplitPaneAction) => ({ kind: 'split' as const })
});
