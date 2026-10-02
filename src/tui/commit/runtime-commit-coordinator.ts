import { renderAccessibleSnapshot } from '../../renderer/output.ts';
import { accessibleFrameOutput, decodeTuiOutputMode } from './accessible-output.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import { diagnostic } from '../../diagnostics.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import {
  requireCommittedTerminalWrite,
  terminalWriteMayHaveCommitted,
} from '../../host/write-receipt.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import { focusPathsEqual } from '../../interaction/focus.ts';
import type { PointerVisualSnapshot } from '../../interaction/pointer-interaction.ts';
import { samePointerVisualSnapshot } from '../../interaction/pointer-interaction.ts';
import type { Frame, LayoutNode, RenderDiff } from '../../renderer/contracts.ts';
import { diffFrames } from '../../renderer/frame.ts';
import {
  activeFocusScopeRestores,
  findAnyLayoutFocusTarget,
  nextFocusPath,
  previousFocusPath,
  resolveFocusPath,
  resolveInitialFocusSelector,
} from '../../renderer/internal/focus.ts';
import { sameThemeRendering } from '../../theme/theme.ts';
import { createTerminalGraphicsCommitter } from './graphics-committer.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import {
  commitFrame,
  dirtyRegionsForRenderCommit,
  renderCurrentFrame,
  rerenderCurrentFrame,
  resolveTuiTheme,
} from './runtime-frame.ts';
import type { CopySelectedTextInput } from '../selection.ts';
import { copySelectedTextToClipboard, suspendedClipboardSelection } from '../selection.ts';
import type { TuiContext, TuiRuntimeOptions } from '../types.ts';

interface CommittedRuntimeRecord<TState, TMessage> {
  readonly state: TState;
  readonly stateVersion: number;
  readonly terminalSize: TerminalSize;
  readonly context: TuiContext;
  readonly render: RenderCommitCandidate<TMessage>;
  readonly focusPath: FocusPath | undefined;
  readonly focusReturnPaths: readonly FocusPath[];
}

export function createRuntimeCommitCoordinator<TState, TMessage>(
  options: Pick<TuiRuntimeOptions<TState, TMessage>, 'app' | 'host' | 'theme' | 'initialFocus' | 'graphics' | 'graphicsBudget' | 'instrumentation' | 'outputMode'> & {
    readonly initialTerminalSize: TerminalSize;
    readonly reportDiagnostic?: (item: TerminalDiagnostic) => void;
    readonly pointerVisuals?: () => PointerVisualSnapshot;
  },
  signal: AbortSignal
) {
  const outputMode = decodeTuiOutputMode(options.outputMode);
  if (outputMode === 'accessible' && options.graphics !== undefined && options.graphics !== 'none') {
    throw new TypeError('Accessible TUI output requires graphics: none.');
  }
  const startingFocusPath: FocusPath | undefined = options.initialFocus?.kind === 'path'
    ? options.initialFocus.path
    : undefined;
  let committed: CommittedRuntimeRecord<TState, TMessage> | undefined;
  let pendingInitialFocus = options.initialFocus;
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
    terminalSize: () => committed?.terminalSize ?? options.initialTerminalSize,
    hasState: () => committed !== undefined,
    state() {
      if (committed === undefined) throw new Error('TUI runtime does not have state.');
      return committed.state;
    },
    version: () => committed?.stateVersion ?? 0,
    render: committedRender,
    renderOrUndefined: () => committed?.render,
    frame() {
      return committedRender().frame;
    },
    focusPath: () => committed === undefined ? startingFocusPath : committed.focusPath,
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
    async repeatAccessibleContext() {
      if (outputMode !== 'accessible') throw new Error('repeatAccessibleContext requires accessible output mode.');
      if (outputSuspended) throw new Error('Accessible output is suspended.');
      const snapshot = committedRender().frame.accessibility;
      signal.throwIfAborted();
      try {
        requireCommittedTerminalWrite(await options.host.write(
          { text: `Context:\n${renderAccessibleSnapshot(snapshot)}\n`.replaceAll('\n', '\r\n') }, { signal },
        ));
      } catch (cause) {
        if (terminalWriteMayHaveCommitted(cause)) outputBaselineKnown = false;
        throw cause;
      }
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
      focus = pendingInitialFocus,
    ) {
      const theme = resolveTuiTheme(options.theme, state);
      const resolution = resolveCandidate(
        state,
        context,
        theme,
        committed?.focusPath ?? startingFocusPath,
        committed?.focusReturnPaths ?? [],
        focus,
        stateVersion,
        candidateCommitId()
      );
      const diff = await write(undefined, resolution.render, theme, context);
      return { render: resolution.render, diff, diagnostics: resolution.diagnostics, resolution, terminalSize: options.initialTerminalSize, context, initial: true };
    },
    async transition(
      state: TState,
      context: TuiContext,
      terminalSize: TerminalSize,
      requestedFocusPath: FocusPath | undefined,
      stateVersion: number,
      focus: TuiRuntimeOptions<TState, TMessage>['initialFocus'],
    ) {
      const theme = resolveTuiTheme(options.theme, state);
      const previousFrame = frameDiffBase(theme);
      const resolution = resolveCandidate(
        state,
        context,
        theme,
        requestedFocusPath,
        committed?.focusReturnPaths ?? [],
        focus,
        stateVersion,
        candidateCommitId()
      );
      const diff = await write(previousFrame, resolution.render, theme, context);
      return { render: resolution.render, diff, diagnostics: resolution.diagnostics, resolution, terminalSize, context, initial: false };
    },
    publish(result: {
      readonly resolution: RuntimeRenderResolution<TMessage>;
      readonly terminalSize: TerminalSize;
      readonly context: TuiContext;
      readonly diff: RenderDiff;
      readonly initial: boolean;
    }, state: TState, stateVersion: number) {
      accept(result.resolution, result.terminalSize, result.context, state, stateVersion);
      if (result.initial) pendingInitialFocus = undefined;
      observeCommittedFrame(result.resolution.render.frame, result.diff);
    },
    publishWithoutFrame(state: TState, stateVersion: number) {
      if (committed === undefined) throw new Error('TUI runtime does not have a committed render.');
      committed = { ...committed, state, stateVersion };
    },
    adjacentFocusPath(direction: 'next' | 'previous') {
      const current = committedRender();
      return direction === 'next'
        ? nextFocusPath(current.layout, committed?.focusPath, options.instrumentation)
        : previousFocusPath(current.layout, committed?.focusPath, options.instrumentation);
    }
  };
  return coordinator;

  function committedRender(): RenderCommitCandidate<TMessage> {
    if (committed === undefined) throw new Error('TUI runtime does not have a committed render.');
    return committed.render;
  }

  async function write(
    previousFrame: Frame | undefined,
    render: RenderCommitCandidate<TMessage>,
    theme: RenderCommitCandidate<TMessage>['theme'],
    context: TuiContext
  ): Promise<RenderDiff> {
    signal.throwIfAborted();
    if (outputSuspended) return diffFrames(previousFrame, render.frame, options.instrumentation === undefined ? {} : { instrumentation: options.instrumentation });
    try {
      if (outputMode === 'accessible') {
        const diff = diffFrames(previousFrame, render.frame, options.instrumentation === undefined ? {} : { instrumentation: options.instrumentation });
        const text = accessibleFrameOutput(outputBaselineKnown ? committed?.render.frame.accessibility : undefined, render.frame.accessibility).replaceAll('\n', '\r\n');
        if (text.length > 0) {
          options.instrumentation?.recordWork?.({ kind: 'encoded_bytes', count: new TextEncoder().encode(text).byteLength });
          requireCommittedTerminalWrite(await options.host.write({ text }, { signal }));
        }
        outputBaselineKnown = true;
        return diff;
      }
      const dirtyRegions = previousFrame === undefined
        ? undefined
        : dirtyRegionsForRenderCommit(committed?.render, render);
      const diff = await commitFrame(options.host, previousFrame, render.frame, theme, context.capabilities, {
        ...(dirtyRegions === undefined ? {} : { dirtyRegions: dirtyRegions.rects }),
        signal,
        graphics,
        ...(options.instrumentation === undefined ? {} : { instrumentation: options.instrumentation })
      });
      outputBaselineKnown = true;
      return diff;
    } catch (cause) {
      if (terminalWriteMayHaveCommitted(cause)) outputBaselineKnown = false;
      throw cause;
    }
  }

  function accept(
    resolution: RuntimeRenderResolution<TMessage>,
    terminalSize: TerminalSize,
    context: TuiContext,
    state: TState,
    stateVersion: number,
  ): void {
    committed = {
      state,
      stateVersion,
      terminalSize,
      context,
      render: resolution.render,
      focusPath: resolution.focusPath,
      focusReturnPaths: [...resolution.focusReturnPaths],
    };
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
      && committed !== undefined
      && sameThemeRendering(committed.render.theme, theme)
      ? committed.render.frame
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
    const planned: { current?: PlannedFocusResolution } = {};
    const focusForLayout = (layout: LayoutNode): FocusPath | undefined => {
      const next = planCandidateFocus(layout, requestedFocusPath, previousReturnPaths, initialFocus);
      planned.current = next;
      return next.focusPath;
    };
    const render = committed !== undefined && canReuseCommittedRender(state, context, theme, requestedFocusPath)
      ? rerenderCurrentFrame(
          options.app,
          state,
          committed.render,
          focusForLayout(committed.render.layout),
          stateVersion,
          commitId,
          options.pointerVisuals?.(),
          options.instrumentation,
        )
      : renderCurrentFrame(
          options.app,
          state,
          context,
          requestedFocusPath,
          theme,
          stateVersion,
          commitId,
          options.graphicsBudget,
          options.pointerVisuals?.(),
          options.instrumentation,
          focusForLayout,
          committed?.render,
        );
    const focus = planned.current;
    if (focus === undefined) throw new Error('TUI frame was painted without resolving its focus.');
    const renderDiagnostics = newRenderDiagnostics(render);
    return {
      render,
      ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
      focusReturnPaths: focus.returnPaths,
      renderDiagnosticFingerprints: renderDiagnostics.fingerprints,
      diagnostics: [...focus.diagnostics, ...renderDiagnostics.diagnostics],
    };
  }

  function planCandidateFocus(
    layout: LayoutNode,
    requested: FocusPath | undefined,
    previousReturnPaths: readonly FocusPath[],
    initialFocus: TuiRuntimeOptions<TState, TMessage>['initialFocus'],
  ): PlannedFocusResolution {
    let desired = requested;
    const diagnostics: TerminalDiagnostic[] = [];
    if (initialFocus !== undefined) {
      const resolution = resolveInitialFocusSelector(layout, initialFocus);
      if (resolution.kind === 'matched') desired = resolution.path;
      else diagnostics.push(initialFocusDiagnostic(options.app.id, resolution));
    }
    let focusPath = resolveFocusPath(layout, desired, options.instrumentation);
    let returnPaths = previousReturnPaths
      .filter((path) => findAnyLayoutFocusTarget(layout, path) !== undefined)
      .map((path) => [...path]);
    const lastReturnPath = returnPaths.at(-1);
    if (lastReturnPath !== undefined && desired !== undefined && !focusPathsEqual(focusPath, desired)) {
      const recovered = resolveFocusPath(layout, lastReturnPath, options.instrumentation);
      if (focusPathsEqual(recovered, lastReturnPath)) focusPath = recovered;
    }
    if (desired !== undefined && focusPath !== undefined
      && !focusPathsEqual(focusPath, desired)
      && findAnyLayoutFocusTarget(layout, desired) !== undefined
      && activeFocusScopeRestores(layout)
      && !returnPaths.some((path) => focusPathsEqual(path, desired))) {
      returnPaths.push([...desired]);
    }
    if (returnPaths.length > 0 && focusPathsEqual(focusPath, returnPaths.at(-1))) {
      returnPaths = returnPaths.slice(0, -1);
    }
    return { focusPath, returnPaths, diagnostics };
  }

  function canReuseCommittedRender(
    state: TState,
    context: TuiContext,
    theme: RenderCommitCandidate<TMessage>['theme'],
    requestedFocusPath: FocusPath | undefined,
  ): boolean {
    if (committed === undefined) return false;
    if (committed.state !== state) return false;
    const previous = committed.context;
    const interactionChanged = !focusPathsEqual(committed.focusPath, requestedFocusPath)
      || !samePointerVisualSnapshot(committed.render.pointerVisuals, options.pointerVisuals?.());
    return interactionChanged
      && previous.capabilities === context.capabilities
      && previous.clock === context.clock
      && previous.terminalSize.columns === context.terminalSize.columns
      && previous.terminalSize.rows === context.terminalSize.rows
      && previous.diagnostics.length === context.diagnostics.length
      && previous.diagnostics.every((item, index) => item === context.diagnostics[index])
      && sameThemeRendering(committed.render.theme, theme);
  }

  function newRenderDiagnostics(render: RenderCommitCandidate<TMessage>): RenderDiagnosticResolution {
    const fingerprints: string[] = [];
    const diagnostics: TerminalDiagnostic[] = [];
    const candidateFingerprints = new Set<string>();
    for (const item of render.frame.accessibility.diagnostics) {
      if (acceptedRenderDiagnostics.has(item.fingerprint) || candidateFingerprints.has(item.fingerprint)) continue;
      candidateFingerprints.add(item.fingerprint);
      fingerprints.push(item.fingerprint);
      diagnostics.push(item);
    }
    return { fingerprints, diagnostics };
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

interface PlannedFocusResolution {
  readonly focusPath: FocusPath | undefined;
  readonly returnPaths: readonly FocusPath[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

interface RenderDiagnosticResolution {
  readonly fingerprints: readonly string[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

type UnmatchedInitialFocusResolution = Exclude<
  ReturnType<typeof resolveInitialFocusSelector>,
  { readonly kind: 'matched' }
>;

function initialFocusDiagnostic(
  appId: string,
  resolution: UnmatchedInitialFocusResolution,
): TerminalDiagnostic {
  return diagnostic(
    'TUI_FOCUS_SELECTION_INVALID',
    resolution.kind === 'missing'
      ? 'Focus selector did not match an active focus target.'
      : 'Focus selector matched multiple active focus targets.',
    {
      severity: 'warning',
      target: appId,
      data: {
        reason: resolution.kind,
        ...(resolution.kind === 'ambiguous'
          ? { paths: resolution.paths.map((path) => path.join('/')) }
          : {}),
      },
    },
  );
}
