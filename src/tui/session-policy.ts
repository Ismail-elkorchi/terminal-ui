import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  MouseReportingMode,
  TerminalSession,
  TerminalStateChange
} from '../host/index.ts';
import type { Result } from '../result.ts';

export type ProtocolRequirement = 'required' | 'optional' | 'disabled';
export type CursorVisibilityPolicy = 'hide' | 'show' | 'unchanged';

export interface SessionProtocolPolicy {
  readonly alternateScreen: ProtocolRequirement;
  readonly rawInput: ProtocolRequirement;
  readonly bracketedPaste: ProtocolRequirement;
  readonly focusReporting: ProtocolRequirement;
  readonly keyboard: {
    readonly profile: 'legacy' | 'enhanced';
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
      readonly kind: 'enhancedKeyboard';
      readonly requirement: ProtocolRequirement;
      readonly target: 'legacy' | 'enhanced';
    };

interface BooleanSessionProtocolOperation {
  readonly kind: 'alternateScreen' | 'rawInput' | 'bracketedPaste' | 'focusReporting';
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
  readonly diagnostics: readonly TerminalDiagnostic[];
}

export const defaultSessionProtocolPolicy: SessionProtocolPolicy = {
  alternateScreen: 'required',
  rawInput: 'required',
  bracketedPaste: 'optional',
  focusReporting: 'optional',
  keyboard: { profile: 'legacy', requirement: 'disabled' },
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
    { kind: 'enhancedKeyboard', requirement: policy.keyboard.requirement, target: policy.keyboard.profile },
    { kind: 'mouseReporting', requirement: policy.mouseReporting.requirement, target: policy.mouseReporting.mode },
    { kind: 'focusReporting', requirement: policy.focusReporting, target: true },
    { kind: 'cursorVisibility', requirement: policy.cursorVisibility.requirement, target: policy.cursorVisibility.state }
  ];
}

export async function applySessionProtocolPolicy(
  session: TerminalSession,
  policy: SessionProtocolPolicy = defaultSessionProtocolPolicy
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
      || item.target === 'legacy'
    ) {
      skipped.push(item);
      diagnostics.push(skippedDiagnostic(session, item));
      continue;
    }
    let result: Result<TerminalStateChange>;
    try {
      result = await applyOperation(session, item);
    } catch (cause) {
      const error = diagnostic('HOST_PROTOCOL_UNSUPPORTED', `Terminal protocol setup failed: ${item.kind}.`, {
        severity: item.requirement === 'required' ? 'error' : 'warning',
        target: session.id,
        cause,
        data: { operation: item.kind, requirement: item.requirement, target: String(item.target) }
      });
      diagnostics.push(error);
      skipped.push(item);
      if (item.requirement === 'required') ok = false;
      continue;
    }
    if (result.ok) {
      applied.push(result.value);
      diagnostics.push(...(result.diagnostics ?? []));
      continue;
    }
    diagnostics.push(operationFailureDiagnostic(session, item, result.error), ...(result.diagnostics ?? []));
    skipped.push(item);
    if (item.requirement === 'required') ok = false;
  }
  return { ok, policy, planned, applied, skipped, diagnostics };
}

async function applyOperation(
  session: TerminalSession,
  item: SessionProtocolOperation
): Promise<Result<TerminalStateChange>> {
  switch (item.kind) {
    case 'alternateScreen':
      return session.enableAlternateScreen();
    case 'rawInput':
      return session.enableRawInput();
    case 'bracketedPaste':
      return session.enableBracketedPaste();
    case 'focusReporting':
      return session.enableFocusReporting();
    case 'enhancedKeyboard':
      return session.enableEnhancedKeyboard();
    case 'cursorVisibility':
      return item.target === 'show' ? session.showCursor() : session.hideCursor();
    case 'mouseReporting':
      return session.enableMouseReporting(item.target);
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
      target: String(item.target)
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
      target: String(item.target)
    }
  });
}
