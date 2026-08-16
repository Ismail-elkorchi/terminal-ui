/** First-party application patterns built from the foundational controls. */
export { commandInput, searchPicker } from './factories/documents.ts';
export { logViewer } from './factories/log-viewer.ts';
export { helpBar } from './factories/feedback.ts';
export { prepareCommandSuggestions } from '../behavior/command-input-state.ts';
export type * from './options/documents.ts';
export type { HelpBarOptions } from './options/feedback.ts';
export type {
  CommandInputPresentation,
  CommandInputSubmitEvent,
  CommandInputTransition,
  CommandSuggestion,
} from '../ui-model/command-input.ts';
export type { CommandInputDisplay, CommandInputValidation, LogEntry } from '../ui-model/documents.ts';
export type {
  SearchPickerAcceptEvent,
  SearchPickerControlTransition,
  SearchPickerPresentation,
  ScrollableSearchPickerPresentation,
  SearchPickerTransition,
  UnscrolledSearchPickerPresentation,
} from '../ui-model/search-picker.ts';
export type {
  LogViewerAction,
  LogViewerBodyAnchor,
  LogViewerControlAction,
  LogViewerSelection,
} from '../ui-model/log-viewer.ts';
