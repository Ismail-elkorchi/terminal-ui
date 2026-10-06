import { decodeMouseReportingState } from '../../protocol/index.ts';
import type { TerminalKeyboardProfile } from '../../protocol/keyboard.ts';
import { decodeKeyboardProfile, LEGACY_KEYBOARD_PROFILE } from '../../protocol/keyboard.ts';
import type {
  TerminalHost,
  TerminalInitialState,
  TerminalStateChange,
  TerminalStateKnowledge,
} from '../types.ts';
import type {
  KeyboardScreenState,
  TerminalScreen,
  TerminalStateAuthorityOptions,
  TerminalStateKey,
  TerminalStateStorage,
} from './contracts.ts';

export function terminalScreen(alternateScreen: boolean): TerminalScreen {
  return alternateScreen ? 'alternate' : 'main';
}

export function otherTerminalScreen(screen: TerminalScreen): TerminalScreen {
  return screen === 'main' ? 'alternate' : 'main';
}

export function keyboardScreenState(
  profile: TerminalKeyboardProfile,
  knowledge: TerminalStateKnowledge,
  uncertain = false
): KeyboardScreenState {
  return Object.freeze({
    profile: Object.isFrozen(profile) ? profile : Object.freeze({ ...profile }),
    knowledge,
    uncertain
  });
}

export function initialTerminalState(
  host: TerminalHost,
  options: TerminalStateAuthorityOptions
): TerminalStateStorage {
  const explicit = decodeInitialTerminalState(options.initialState);
  const rawInput = explicit.rawInput ?? host.stdin.isRawModeEnabled?.() ?? false;
  const values = {
    rawInput,
    alternateScreen: explicit.alternateScreen ?? false,
    bracketedPaste: explicit.bracketedPaste ?? false,
    mouseReporting: explicit.mouseReporting ?? Object.freeze({ tracking: 'none', encoding: 'default' }),
    focusReporting: explicit.focusReporting ?? false,
    metaSendsEscape: explicit.metaSendsEscape ?? false,
    unicodeGraphemeMode: explicit.unicodeGraphemeMode ?? false,
    bidiMode: explicit.bidiMode ?? 'unknown',
    keyboardProfile: explicit.keyboardProfile ?? LEGACY_KEYBOARD_PROFILE,
    cursorVisible: explicit.cursorVisible ?? true
  } satisfies Omit<TerminalStateStorage, 'provenance'>;
  const provenance: TerminalStateStorage['provenance'] = {
    rawInput: Object.hasOwn(explicit, 'rawInput') ? 'explicit' : options.rawInputKnowledge,
    alternateScreen: initialKnowledge(explicit, 'alternateScreen'),
    bracketedPaste: initialKnowledge(explicit, 'bracketedPaste'),
    mouseReporting: initialKnowledge(explicit, 'mouseReporting'),
    focusReporting: initialKnowledge(explicit, 'focusReporting'),
    metaSendsEscape: initialKnowledge(explicit, 'metaSendsEscape'),
    unicodeGraphemeMode: initialKnowledge(explicit, 'unicodeGraphemeMode'),
    bidiMode: initialKnowledge(explicit, 'bidiMode'),
    keyboardProfile: initialKnowledge(explicit, 'keyboardProfile'),
    cursorVisible: initialKnowledge(explicit, 'cursorVisible')
  };
  return freezeTerminalState({ ...values, provenance });
}

function initialKnowledge(
  state: TerminalInitialState,
  kind: Exclude<TerminalStateKey, 'rawInput'>
): TerminalStateKnowledge {
  return Object.hasOwn(state, kind) ? 'explicit' : 'assumed';
}

function decodeInitialTerminalState(initial: unknown): TerminalInitialState {
  if (initial === undefined) return {};
  if (typeof initial !== 'object' || initial === null || Array.isArray(initial)) {
    throw new TypeError('Terminal initial state must be an object.');
  }
  const supplied = initial as Readonly<Record<string, unknown>>;
  if (Object.hasOwn(supplied, 'cellPresentation')) throw new TypeError('Initial cellPresentation is not raw terminal state; configure admission through capabilities.cellPresentation.');
  const rawInput = optionalInitialBoolean(supplied['rawInput'], 'rawInput');
  const alternateScreen = optionalInitialBoolean(supplied['alternateScreen'], 'alternateScreen');
  const bracketedPaste = optionalInitialBoolean(supplied['bracketedPaste'], 'bracketedPaste');
  const focusReporting = optionalInitialBoolean(supplied['focusReporting'], 'focusReporting');
  const metaSendsEscape = optionalInitialBoolean(supplied['metaSendsEscape'], 'metaSendsEscape');
  const unicodeGraphemeMode = optionalInitialBoolean(
    supplied['unicodeGraphemeMode'],
    'unicodeGraphemeMode',
  );
  const bidiMode = supplied['bidiMode'];
  if (bidiMode !== undefined && bidiMode !== 'unknown' && bidiMode !== 'implicit' && bidiMode !== 'explicit') {
    throw new TypeError('Terminal initial state bidiMode must be unknown, implicit or explicit.');
  }
  const cursorVisible = optionalInitialBoolean(supplied['cursorVisible'], 'cursorVisible');
  const mouseReporting = supplied['mouseReporting'];
  const keyboardProfile = supplied['keyboardProfile'];
  return Object.freeze({
    ...(rawInput === undefined ? {} : { rawInput }),
    ...(alternateScreen === undefined ? {} : { alternateScreen }),
    ...(bracketedPaste === undefined ? {} : { bracketedPaste }),
    ...(focusReporting === undefined ? {} : { focusReporting }),
    ...(metaSendsEscape === undefined ? {} : { metaSendsEscape }),
    ...(unicodeGraphemeMode === undefined
      ? {}
      : { unicodeGraphemeMode }),
    ...(bidiMode === undefined ? {} : { bidiMode }),
    ...(cursorVisible === undefined ? {} : { cursorVisible }),
    ...(mouseReporting === undefined
      ? {}
      : { mouseReporting: decodeMouseReportingState(mouseReporting) }),
    ...(keyboardProfile === undefined
      ? {}
      : { keyboardProfile: decodeKeyboardProfile(keyboardProfile) })
  });
}

function optionalInitialBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  throw new TypeError(`Terminal initial state ${field} must be a boolean.`);
}

export function cloneTerminalState(
  state: TerminalStateStorage,
  uncertain: ReadonlySet<TerminalStateKey>
): TerminalStateStorage {
  const provenance = { ...state.provenance };
  for (const key of uncertain) provenance[key] = 'indeterminate';
  return freezeTerminalState({ ...state, provenance });
}

export function freezeTerminalState(state: TerminalStateStorage): TerminalStateStorage {
  return Object.freeze({
    ...state,
    mouseReporting: Object.isFrozen(state.mouseReporting)
      ? state.mouseReporting
      : Object.freeze({ ...state.mouseReporting }),
    keyboardProfile: Object.isFrozen(state.keyboardProfile)
      ? state.keyboardProfile
      : Object.freeze({ ...state.keyboardProfile }),
    provenance: Object.freeze({ ...state.provenance })
  });
}

export function knowledgeAfterMutation(
  kind: TerminalStateKey,
  rawInputKnowledge: TerminalStateKnowledge
): TerminalStateKnowledge {
  return kind === 'rawInput' && rawInputKnowledge === 'observed' ? 'observed' : 'library_known';
}

export function keyboardProfilesEqual(left: TerminalKeyboardProfile, right: TerminalKeyboardProfile): boolean {
  return left.kind === right.kind
    && (left.kind === 'legacy' || (right.kind === 'kitty' && left.flags === right.flags));
}

export function sameMouseReportingState(
  left: TerminalStateStorage['mouseReporting'],
  right: TerminalStateStorage['mouseReporting']
): boolean {
  return left.tracking === right.tracking && left.encoding === right.encoding;
}

export function freezeTerminalStateChange(change: TerminalStateChange): TerminalStateChange {
  return Object.freeze({ ...change });
}
