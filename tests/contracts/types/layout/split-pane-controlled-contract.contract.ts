import { text, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { splitPane, type SplitPaneTransition } from '@ismail-elkorchi/terminal-ui/layout';
import {
  createSplitPaneState,
  splitPaneLayout,
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
  ...splitPaneLayout(state),
  onTransition: (action) => ({ kind: 'split' as const, action })
});

const acceptedPassive: Element = passive;
const acceptedInteractive: Element<{
  readonly kind: 'split';
  readonly action: SplitPaneTransition;
}> = interactive;
void [acceptedPassive, acceptedInteractive];

// @ts-expect-error resizable panes require a stable component id
splitPane([text({ content: 'A' }), text({ content: 'B' })], {
  direction: 'horizontal',
  sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
  onTransition: (_action: SplitPaneTransition) => ({ kind: 'split' as const })
});
