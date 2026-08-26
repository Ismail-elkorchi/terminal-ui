import { diagnostic } from '../diagnostics.ts';
import { terminalWriteMayHaveCommitted } from '../host/write-receipt.ts';
import {
  activeFocusScopeRestores,
  findAnyLayoutFocusTarget,
  nextFocusPath,
  previousFocusPath,
  resolveInitialFocusSelector
} from '../renderer/internal/focus.ts';
import {
  commitFrame,
  dirtyRegionsForRenderCommit,
  renderCurrentFrame,
  rerenderCurrentFrame,
  resolveTuiTheme
} from './runtime-frame.ts';
import { diffFrames } from '../renderer/frame.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import { focusPathsEqual } from '../interaction/focus.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { Frame, RenderDiff } from '../renderer/index.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import type { TuiContext, TuiRuntimeOptions } from './types.ts';
import { createTerminalGraphicsCommitter } from './graphics-committer.ts';
import { requireCommittedTerminalWrite } from '../host/write-receipt.ts';
import { sameThemeRendering } from '../theme/theme.ts';
import type { PointerVisualSnapshot } from '../interaction/pointer-interaction.ts';
import {
  copySelectedTextToClipboard,
  suspendedClipboardSelection,
} from './selection.ts';
import type { CopySelectedTextInput } from './selection.ts';

export function createRuntimeCommitCoordinator<TState, TMessage>(
  options: Pick<TuiRuntimeOptions<TState, TMessage>, 'app' | 'host' | 'theme' | 'initialFocus' | 'graphics' | 'graphicsBudget'> & {
    readonly reportDiagnostic?: (item: TerminalDiagnostic) => void;
    readonly pointerVisuals?: () => PointerVisualSnapshot;
  },
  signal: AbortSignal
) {
  let currentTerminalSize = options.host.getTerminalSize();
  let currentRender: RenderCommitCandidate<TMessage> | undefined;
  let currentFocusPath: FocusPath | undefined = options.initialFocus?.kind === 'path'
    ? options.initialFocus.path
    : undefined;
  let pendingInitialFocus = options.initialFocus;
  let focusReturnPaths: FocusPath[] = [];
  let outputBaselineKnown = false;
  let outputSuspended = false;
  let nextCommitSequence = 1;
  const acceptedRenderDiagnostics = new Map<string, true>();
  const graphics = createTerminalGraphicsCommitter(
    options.graphics ?? 'none',
    options.graphicsBudget,
    options.reportDiagnostic,
  );

  const coordinator = {
    terminalSize: () => currentTerminalSize,
    render: committedRender,
    renderOrUndefined: () => currentRender,
    frame() {
      if (currentRender === undefined) throw new Error('TUI runtime does not have a frame.');
      return currentRender.frame;
    },
    focusPath: () => currentFocusPath,
    copySelectedText(
      input: CopySelectedTextInput,
      capabilities: TuiContext['capabilities'],
      operationSignal?: AbortSignal,
    ) {
      if (outputSuspended) return Promise.resolve(suspendedClipboardSelection(input.selection));
      const writeSignal = operationSignal === undefined
        ? signal
        : AbortSignal.any([signal, operationSignal]);
      return copySelectedTextToClipboard(
        options.host,
        capabilities,
        input,
        writeSignal,
      );
    },
    async suspendOutput() {
      outputSuspended = true;
      outputBaselineKnown = false;
      const cleanup = graphics.cleanup();
      if (cleanup.length > 0) {
        try {
          requireCommittedTerminalWrite(await options.host.write({ text: cleanup }, { signal }));
        } catch (cause) {
          outputSuspended = false;
          graphics.invalidate();
          throw cause;
        }
      }
    },
    resumeOutput() {
      outputSuspended = false;
      outputBaselineKnown = false;
      graphics.invalidate();
    },
    async dispose() {
      const cleanup = graphics.cleanup();
      if (cleanup.length === 0) return;
      requireCommittedTerminalWrite(await options.host.write({ text: cleanup }));
    },
    async initial(
      state: TState,
      context: TuiContext,
      stateVersion: number,
      publishState: () => void,
      focus = pendingInitialFocus,
    ) {
      const theme = resolveTuiTheme(options.theme, state);
      const resolution = resolveCandidate(
        state,
        context,
        theme,
        currentFocusPath,
        focusReturnPaths,
        focus,
        stateVersion,
        candidateCommitId()
      );
      const diff = await write(undefined, resolution.render, theme, context);
      accept(resolution, currentTerminalSize);
      publishState();
      observeCommittedFrame(resolution.render.frame, diff);
      pendingInitialFocus = undefined;
      return { render: resolution.render, diff, diagnostics: resolution.diagnostics };
    },
    async transition(
      state: TState,
      context: TuiContext,
      terminalSize: TerminalSize,
      requestedFocusPath: FocusPath | undefined,
      stateVersion: number,
      focus: TuiRuntimeOptions<TState, TMessage>['initialFocus'],
      publishState: () => void
    ) {
      const theme = resolveTuiTheme(options.theme, state);
      const previousFrame = frameDiffBase(theme);
      const resolution = resolveCandidate(
        state,
        context,
        theme,
        requestedFocusPath,
        focusReturnPaths,
        focus,
        stateVersion,
        candidateCommitId()
      );
      const diff = await write(previousFrame, resolution.render, theme, context);
      accept(resolution, terminalSize);
      publishState();
      observeCommittedFrame(resolution.render.frame, diff);
      return { render: resolution.render, diff, diagnostics: resolution.diagnostics };
    },
    adjacentFocusPath(direction: 'next' | 'previous') {
      const current = committedRender();
      return direction === 'next'
        ? nextFocusPath(current.layout, currentFocusPath)
        : previousFocusPath(current.layout, currentFocusPath);
    }
  };
  return coordinator;

  function committedRender(): RenderCommitCandidate<TMessage> {
    if (currentRender === undefined) throw new Error('TUI runtime does not have a committed render.');
    return currentRender;
  }

  async function write(
    previousFrame: Frame | undefined,
    render: RenderCommitCandidate<TMessage>,
    theme: RenderCommitCandidate<TMessage>['theme'],
    context: TuiContext
  ): Promise<RenderDiff> {
    signal.throwIfAborted();
    if (outputSuspended) return diffFrames(previousFrame, render.frame);
    try {
      const dirtyRegions = previousFrame === undefined
        ? undefined
        : dirtyRegionsForRenderCommit(currentRender, render);
      const diff = await commitFrame(options.host, previousFrame, render.frame, theme, context.capabilities, {
        ...(dirtyRegions === undefined ? {} : { dirtyRegions: dirtyRegions.rects }),
        signal,
        graphics
      });
      outputBaselineKnown = true;
      return diff;
    } catch (cause) {
      if (terminalWriteMayHaveCommitted(cause)) outputBaselineKnown = false;
      throw cause;
    }
  }

  function accept(resolution: RuntimeRenderResolution<TMessage>, terminalSize: TerminalSize): void {
    currentTerminalSize = terminalSize;
    currentRender = resolution.render;
    currentFocusPath = resolution.focusPath;
    focusReturnPaths = [...resolution.focusReturnPaths];
    for (const fingerprint of resolution.renderDiagnosticFingerprints) {
      acceptedRenderDiagnostics.delete(fingerprint);
      acceptedRenderDiagnostics.set(fingerprint, true);
      if (acceptedRenderDiagnostics.size > 1_024) {
        const oldest = acceptedRenderDiagnostics.keys().next().value;
        if (oldest !== undefined) acceptedRenderDiagnostics.delete(oldest);
      }
    }
    nextCommitSequence += 1;
  }

  function frameDiffBase(theme: RenderCommitCandidate<TMessage>['theme']): Frame | undefined {
    return outputBaselineKnown
      && currentRender !== undefined
      && sameThemeRendering(currentRender.theme, theme)
      ? currentRender.frame
      : undefined;
  }

  function candidateCommitId(): string {
    return `${options.app.id}:commit:${String(nextCommitSequence)}`;
  }

  function resolveCandidate(
    state: TState,
    context: TuiContext,
    theme: RenderCommitCandidate<TMessage>['theme'],
    requestedFocusPath: FocusPath | undefined,
    previousReturnPaths: readonly FocusPath[],
    initialFocus: TuiRuntimeOptions<TState, TMessage>['initialFocus'],
    stateVersion: number,
    commitId: string
  ): RuntimeRenderResolution<TMessage> {
    const diagnostics: TerminalDiagnostic[] = [];
    let desiredFocusPath = requestedFocusPath;
    let render = renderCurrentFrame(
      options.app,
      state,
      context,
      desiredFocusPath,
      theme,
      stateVersion,
      commitId,
      options.graphicsBudget,
      options.pointerVisuals?.(),
    );
    if (initialFocus !== undefined) {
      const resolution = resolveInitialFocusSelector(render.layout, initialFocus);
      if (resolution.kind === 'matched' && !focusPathsEqual(resolution.path, render.frame.focusPath)) {
        desiredFocusPath = resolution.path;
        render = rerenderCurrentFrame(
          options.app,
          state,
          render,
          desiredFocusPath,
          stateVersion,
          commitId,
          options.pointerVisuals?.(),
        );
      } else if (resolution.kind !== 'matched') {
        diagnostics.push(diagnostic(
          'TUI_FOCUS_SELECTION_INVALID',
          resolution.kind === 'missing'
            ? 'Focus selector did not match an active focus target.'
            : 'Focus selector matched multiple active focus targets.',
          {
            severity: 'warning',
            target: options.app.id,
            data: {
              reason: resolution.kind,
              ...(resolution.kind === 'ambiguous'
                ? { paths: resolution.paths.map((path) => path.join('/')) }
                : {})
            }
          }
        ));
      }
    }
    let nextReturnPaths = previousReturnPaths
      .filter((path) => findAnyLayoutFocusTarget(render.layout, path) !== undefined)
      .map((path) => [...path]);
    const focusReturnPath = nextReturnPaths.at(-1);
    if (
      focusReturnPath !== undefined
      && desiredFocusPath !== undefined
      && !focusPathsEqual(render.frame.focusPath, desiredFocusPath)
    ) {
      const recovered = rerenderCurrentFrame(
        options.app,
        state,
        render,
        focusReturnPath,
        stateVersion,
        commitId,
        options.pointerVisuals?.(),
      );
      if (focusPathsEqual(recovered.frame.focusPath, focusReturnPath)) render = recovered;
    }
    if (
      desiredFocusPath !== undefined
      && render.frame.focusPath !== undefined
      && !focusPathsEqual(render.frame.focusPath, desiredFocusPath)
      && findAnyLayoutFocusTarget(render.layout, desiredFocusPath) !== undefined
      && activeFocusScopeRestores(render.layout)
      && !nextReturnPaths.some((path) => focusPathsEqual(path, desiredFocusPath))
    ) {
      nextReturnPaths.push([...desiredFocusPath]);
    }
    if (nextReturnPaths.length > 0 && focusPathsEqual(render.frame.focusPath, nextReturnPaths.at(-1))) {
      nextReturnPaths = nextReturnPaths.slice(0, -1);
    }
    const renderDiagnosticFingerprints: string[] = [];
    const candidateFingerprints = new Set<string>();
    for (const item of render.frame.accessibility.diagnostics) {
      if (acceptedRenderDiagnostics.has(item.fingerprint) || candidateFingerprints.has(item.fingerprint)) continue;
      candidateFingerprints.add(item.fingerprint);
      renderDiagnosticFingerprints.push(item.fingerprint);
      diagnostics.push(item);
    }
    return {
      render,
      ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
      focusReturnPaths: nextReturnPaths,
      renderDiagnosticFingerprints,
      diagnostics
    };
  }

  function observeCommittedFrame(frame: Frame, diff: RenderDiff): void {
    notifyObserver('recordFrame', frame);
    notifyObserver('recordDiff', diff);
  }

  function notifyObserver(method: 'recordFrame' | 'recordDiff', value: unknown): void {
    try {
      options.host.observer?.[method]?.(value);
    } catch (cause) {
      try {
        options.reportDiagnostic?.(diagnostic(
          'TUI_RUNTIME_TASK_FAILED',
          `Terminal host observer ${method} failed.`,
          { target: options.host.id, cause, data: { taskName: `host_observer_${method}` } }
        ));
      } catch {
        // Observability is never part of terminal publication correctness.
      }
    }
  }
}

interface RuntimeRenderResolution<TMessage> {
  readonly render: RenderCommitCandidate<TMessage>;
  readonly focusPath?: FocusPath;
  readonly focusReturnPaths: readonly FocusPath[];
  readonly renderDiagnosticFingerprints: readonly string[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}
