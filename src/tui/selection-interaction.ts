import { diagnostic } from '../diagnostics.ts';
import { writeClipboardText } from '../protocol/index.ts';
import { extractTextSelection } from '../text/index.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalHost } from '../host/index.ts';
import type { ClipboardWritePolicy, ClipboardWriteResult } from '../protocol/index.ts';
import type { TextSelection } from '../text/index.ts';

export type SelectionInteractionMode = 'application' | 'terminalNative';

export interface SelectableTextSource {
  readonly id: string;
  readonly text: string;
  readonly selection?: TextSelection;
  readonly label?: string;
  readonly priority?: number;
  readonly sanitize?: boolean;
}

export interface ResolveSelectedTextInput {
  readonly mode?: SelectionInteractionMode;
  readonly sources: readonly SelectableTextSource[];
  readonly activeSourceId?: string;
}

export type ResolveSelectedTextResult =
  | {
      readonly ok: true;
      readonly mode: SelectionInteractionMode;
      readonly sourceId: string;
      readonly label?: string;
      readonly text: string;
      readonly byteLength: number;
    }
  | {
      readonly ok: false;
      readonly mode: SelectionInteractionMode;
      readonly diagnostic: TerminalDiagnostic;
    };

export interface CopySelectedTextInput extends ResolveSelectedTextInput {
  readonly host: TerminalHost;
  readonly policy: ClipboardWritePolicy;
}

export type CopySelectedTextResult =
  | {
      readonly ok: true;
      readonly selection: Extract<ResolveSelectedTextResult, { readonly ok: true }>;
      readonly clipboard: Extract<ClipboardWriteResult, { readonly ok: true }>;
    }
  | {
      readonly ok: false;
      readonly selection?: ResolveSelectedTextResult;
      readonly diagnostic: TerminalDiagnostic;
    };

export function resolveSelectedText(input: ResolveSelectedTextInput): ResolveSelectedTextResult {
  const mode = input.mode ?? 'application';
  if (mode === 'terminalNative') {
    return {
      ok: false,
      mode,
      diagnostic: diagnostic('SELECTION_UNAVAILABLE', 'Selection is delegated to the terminal native selection model.', {
        severity: 'info',
        target: 'selection',
        hint: 'Use application selection mode when app-owned selection text should be available to commands.'
      })
    };
  }
  const selected = selectedSource(input.sources, input.activeSourceId);
  if (selected === undefined) {
    return {
      ok: false,
      mode,
      diagnostic: diagnostic('SELECTION_UNAVAILABLE', 'No application-owned text selection is active.', {
        severity: 'info',
        target: 'selection',
        data: {
          sourceCount: input.sources.length,
          activeSourceId: input.activeSourceId ?? null
        }
      })
    };
  }
  return {
    ok: true,
    mode,
    sourceId: selected.source.id,
    ...(selected.source.label === undefined ? {} : { label: selected.source.label }),
    text: selected.text,
    byteLength: new TextEncoder().encode(selected.text).byteLength
  };
}

export async function copySelectedTextToClipboard(input: CopySelectedTextInput): Promise<CopySelectedTextResult> {
  const selection = resolveSelectedText(input);
  if (!selection.ok) return { ok: false, selection, diagnostic: selection.diagnostic };
  const clipboard = await writeClipboardText(input.host, selection.text, input.policy);
  if (!clipboard.ok) return { ok: false, selection, diagnostic: clipboard.diagnostic };
  return { ok: true, selection, clipboard };
}

function selectedSource(
  sources: readonly SelectableTextSource[],
  activeSourceId: string | undefined
): { readonly source: SelectableTextSource; readonly text: string } | undefined {
  const active = activeSourceId === undefined
    ? undefined
    : sources.find((source) => source.id === activeSourceId);
  const activeText = selectedTextForSource(active);
  if (active !== undefined && activeText !== undefined) return { source: active, text: activeText };

  return sources
    .map((source) => ({ source, text: selectedTextForSource(source) }))
    .filter((item): item is { readonly source: SelectableTextSource; readonly text: string } => item.text !== undefined)
    .sort((left, right) => priority(right.source) - priority(left.source))[0];
}

function selectedTextForSource(source: SelectableTextSource | undefined): string | undefined {
  if (source === undefined) return undefined;
  if (source.selection === undefined) return undefined;
  const text = extractTextSelection({
    text: source.text,
    selection: source.selection,
    ...(source.sanitize === undefined ? {} : { sanitize: source.sanitize })
  });
  return text === undefined || text.length === 0 ? undefined : text;
}

function priority(source: SelectableTextSource): number {
  return Number.isFinite(source.priority) ? Math.trunc(source.priority ?? 0) : 0;
}
