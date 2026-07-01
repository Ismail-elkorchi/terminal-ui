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
  readonly cursorVisibility: {
    readonly state: CursorVisibilityPolicy;
    readonly requirement: ProtocolRequirement;
  };
  readonly mouseReporting: {
    readonly mode: MouseReportingMode;
    readonly requirement: ProtocolRequirement;
  };
}

export type SessionProtocolOperationKind =
  | 'alternateScreen'
  | 'rawInput'
  | 'bracketedPaste'
  | 'focusReporting'
  | 'cursorVisibility'
  | 'mouseReporting';

export interface SessionProtocolOperation {
  readonly kind: SessionProtocolOperationKind;
  readonly requirement: ProtocolRequirement;
  readonly target: boolean | CursorVisibilityPolicy | MouseReportingMode;
}

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
  cursorVisibility: { state: 'hide', requirement: 'optional' },
  mouseReporting: { mode: 'click', requirement: 'optional' }
};

export function createSessionProtocolPlan(
  policy: SessionProtocolPolicy = defaultSessionProtocolPolicy
): readonly SessionProtocolOperation[] {
  return [
    operation('alternateScreen', policy.alternateScreen, true),
    operation('bracketedPaste', policy.bracketedPaste, true),
    operation('rawInput', policy.rawInput, true),
    operation('mouseReporting', policy.mouseReporting.requirement, policy.mouseReporting.mode),
    operation('focusReporting', policy.focusReporting, true),
    operation('cursorVisibility', policy.cursorVisibility.requirement, policy.cursorVisibility.state)
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
    if (item.requirement === 'disabled' || item.target === 'unchanged' || item.target === 'none') {
      skipped.push(item);
      diagnostics.push(skippedDiagnostic(session, item));
      continue;
    }
    const result = await applyOperation(session, item);
    if (result.ok) {
      applied.push(result.value);
      diagnostics.push(...(result.diagnostics ?? []));
      continue;
    }
    diagnostics.push(result.error, ...(result.diagnostics ?? []));
    skipped.push(item);
    if (item.requirement === 'required') ok = false;
  }
  return { ok, policy, planned, applied, skipped, diagnostics };
}

function operation(
  kind: SessionProtocolOperationKind,
  requirement: ProtocolRequirement,
  target: SessionProtocolOperation['target']
): SessionProtocolOperation {
  return { kind, requirement, target };
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
    case 'cursorVisibility':
      return item.target === 'show' ? session.showCursor() : session.hideCursor();
    case 'mouseReporting':
      return session.enableMouseReporting(item.target as MouseReportingMode);
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
