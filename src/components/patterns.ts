/** First-party application patterns built from the foundational controls. */
export { commandInput, searchPicker } from './factories/suggestion-controls.ts';
export { logViewer } from './factories/log-viewer.ts';
export { helpBar } from './factories/indicators.ts';
export { createCommandSuggestions } from '../behavior/command-input-operations.ts';
export type * from './options/patterns.ts';
export type { HelpBarOptions } from './options/feedback-and-visualizations.ts';
export type {
  CommandInputView,
  CommandInputSubmitEvent,
  CommandInputTransition,
  CommandSuggestion,
} from '../behavior/command-input.ts';
export type { CommandInputDisplay, CommandInputValidation } from './command-input.ts';
export type { LogEntry } from '../behavior/log-history.ts';
export type {
  SearchPickerAcceptEvent,
  SearchPickerControlTransition,
  SearchPickerView,
  ScrollableSearchPickerView,
  SearchPickerTransition,
  UnscrolledSearchPickerView,
} from '../behavior/search-picker.ts';
export type {
  LogViewerTransition,
  LogViewerBodyAnchor,
  LogViewerContextMenuEvent,
  LogViewerControlTransition,
  LogViewerSelection,
} from '../behavior/log-viewer.ts';
