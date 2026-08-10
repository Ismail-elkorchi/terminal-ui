import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  MouseReportingMode,
  TerminalOperationContext,
  TerminalOperationOutcome,
  TerminalSession,
  TerminalStateChange,
  TerminalStateSnapshot
} from '../host/index.ts';
import type { InputPipelineOptions } from '../input/index.ts';
import { LEGACY_KEYBOARD_PROFILE } from '../protocol/keyboard.ts';
import type { TerminalKeyboardProfile } from '../protocol/keyboard.ts';

export type ProtocolRequirement = 'required' | 'optional' | 'disabled';
export type CursorVisibilityPolicy = 'hide' | 'show' | 'unchanged';

export interface SessionProtocolPolicy {
  readonly alternateScreen: ProtocolRequirement;
  readonly rawInput: ProtocolRequirement;
  readonly bracketedPaste: ProtocolRequirement;
  readonly focusReporting: ProtocolRequirement;
  readonly unicodeGraphemeMode: ProtocolRequirement;
  readonly keyboard: {
    readonly profile: TerminalKeyboardProfile;
    readonly requirement: ProtocolRequirement;
  };
  readonly cursorVisibility: {
    readonly state: CursorVisibilityPolicy;
    readonly requirement: ProtocolRequirement;
  };
  readonly mouseReporting: {
    readonly mode: MouseReportingMode;
    readonly requirement: ProtocolRequirement;
  };
}

export type SessionProtocolOperation =
  | BooleanSessionProtocolOperation
  | {
      readonly kind: 'cursorVisibility';
      readonly requirement: ProtocolRequirement;
      readonly target: CursorVisibilityPolicy;
    }
  | {
      readonly kind: 'mouseReporting';
      readonly requirement: ProtocolRequirement;
      readonly target: MouseReportingMode;
    }
  | {
      readonly kind: 'keyboardProfile';
      readonly requirement: ProtocolRequirement;
      readonly target: TerminalKeyboardProfile;
    };

interface BooleanSessionProtocolOperation {
  readonly kind: 'alternateScreen' | 'rawInput' | 'bracketedPaste' | 'focusReporting' | 'unicodeGraphemeMode';
  readonly requirement: ProtocolRequirement;
  readonly target: true;
}

export type SessionProtocolOperationKind = SessionProtocolOperation['kind'];

export interface SessionProtocolSetupResult {
  readonly ok: boolean;
  readonly policy: SessionProtocolPolicy;
  readonly planned: readonly SessionProtocolOperation[];
  readonly applied: readonly TerminalStateChange[];
  readonly skipped: readonly SessionProtocolOperation[];
  readonly resultingState: TerminalStateSnapshot;
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export const defaultSessionProtocolPolicy: SessionProtocolPolicy = {
  alternateScreen: 'required',
  rawInput: 'required',
  bracketedPaste: 'optional',
  focusReporting: 'optional',
  unicodeGraphemeMode: 'optional',
  keyboard: { profile: LEGACY_KEYBOARD_PROFILE, requirement: 'disabled' },
  cursorVisibility: { state: 'hide', requirement: 'optional' },
  mouseReporting: { mode: 'drag', requirement: 'optional' }
};

export function createSessionProtocolPlan(
  policy: SessionProtocolPolicy = defaultSessionProtocolPolicy
): readonly SessionProtocolOperation[] {
  return [
    { kind: 'alternateScreen', requirement: policy.alternateScreen, target: true },
    { kind: 'bracketedPaste', requirement: policy.bracketedPaste, target: true },
    { kind: 'rawInput', requirement: policy.rawInput, target: true },
    { kind: 'unicodeGraphemeMode', requirement: policy.unicodeGraphemeMode, target: true },
    { kind: 'keyboardProfile', requirement: policy.keyboard.requirement, target: policy.keyboard.profile },
    { kind: 'mouseReporting', requirement: policy.mouseReporting.requirement, target: policy.mouseReporting.mode },
    { kind: 'focusReporting', requirement: policy.focusReporting, target: true },
    { kind: 'cursorVisibility', requirement: policy.cursorVisibility.requirement, target: policy.cursorVisibility.state }
  ];
}

export async function applySessionProtocolPolicy(
  session: TerminalSession,
  policy: SessionProtocolPolicy = defaultSessionProtocolPolicy,
  context: TerminalOperationContext = {}
): Promise<SessionProtocolSetupResult> {
  const planned = createSessionProtocolPlan(policy);
  const applied: TerminalStateChange[] = [];
  const skipped: SessionProtocolOperation[] = [];
  const diagnostics: TerminalDiagnostic[] = [];
  let ok = true;
  for (const item of planned) {
    if (
      item.requirement === 'disabled'
      || item.target === 'unchanged'
      || item.target === 'none'
    ) {
      skipped.push(item);
      diagnostics.push(skippedDiagnostic(session, item));
      continue;
    }
    const result = await applyOperation(session, item, context);
    if (result.status === 'applied') {
      applied.push(result.change);
      diagnostics.push(...result.diagnostics);
      continue;
    }
    diagnostics.push(operationFailureDiagnostic(session, item, result.diagnostic), ...result.diagnostics);
    skipped.push(item);
    if (item.requirement === 'required' || result.status === 'indeterminate') ok = false;
  }
  const resultingState = await session.currentState();
  if (
    resultingState.mouseReporting.tracking !== 'none'
    && resultingState.mouseReporting.encoding !== 'sgr'
  ) {
    ok = false;
    diagnostics.push(diagnostic(
      'HOST_PROTOCOL_UNSUPPORTED',
      'The active terminal mouse encoding is not supported by the input decoder.',
      {
        target: session.id,
        data: {
          operation: 'mouseReporting',
          tracking: resultingState.mouseReporting.tracking,
          encoding: resultingState.mouseReporting.encoding
        }
      }
    ));
  }
  return { ok, policy, planned, applied, skipped, resultingState, diagnostics };
}

export function inputProfileForSession(
  setup: SessionProtocolSetupResult
): Pick<InputPipelineOptions, 'bracketedPaste' | 'focusReporting' | 'mouseReporting' | 'keyboard'> {
  const state = setup.resultingState;
  return Object.freeze({
    bracketedPaste: state.bracketedPaste,
    focusReporting: state.focusReporting,
    mouseReporting: state.mouseReporting.encoding === 'sgr'
      ? state.mouseReporting.tracking
      : 'none',
    keyboard: state.keyboardProfile
  });
}

async function applyOperation(
  session: TerminalSession,
  item: SessionProtocolOperation,
  context: TerminalOperationContext
): Promise<TerminalOperationOutcome> {
  switch (item.kind) {
    case 'alternateScreen':
      return session.enableAlternateScreen(context);
    case 'rawInput':
      return session.enableRawInput(context);
    case 'bracketedPaste':
      return session.enableBracketedPaste(context);
    case 'focusReporting':
      return session.enableFocusReporting(context);
    case 'unicodeGraphemeMode':
      return session.enableUnicodeGraphemeMode(context);
    case 'keyboardProfile':
      return session.enableKeyboardProfile(item.target, context);
    case 'cursorVisibility':
      return item.target === 'show' ? session.showCursor(context) : session.hideCursor(context);
    case 'mouseReporting':
      return session.enableMouseReporting(item.target, context);
  }
}

function skippedDiagnostic(
  session: TerminalSession,
  item: SessionProtocolOperation
): TerminalDiagnostic {
  return diagnostic('HOST_PROTOCOL_SKIPPED', `Terminal protocol operation skipped: ${item.kind}.`, {
    severity: 'info',
    target: session.id,
    data: {
      operation: item.kind,
      requirement: item.requirement,
      target: protocolTarget(item.target)
    }
  });
}

function operationFailureDiagnostic(
  session: TerminalSession,
  item: SessionProtocolOperation,
  error: TerminalDiagnostic
): TerminalDiagnostic {
  return diagnostic(error.code, error.message, {
    severity: error.severity,
    target: error.target ?? session.id,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
    ...(error.hint === undefined ? {} : { hint: error.hint }),
    data: {
      ...(error.data ?? {}),
      operation: item.kind,
      requirement: item.requirement,
      target: protocolTarget(item.target)
    }
  });
}

function protocolTarget(target: SessionProtocolOperation['target']): string {
  return typeof target === 'object' ? `${target.kind}:${target.kind === 'kitty' ? String(target.flags) : ''}` : String(target);
}
