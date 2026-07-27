import { diagnostic } from '../diagnostics.ts';
import { terminalWriteWasIndeterminate } from '../host/write-receipt.ts';
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
  resolveTuiTheme
} from './runtime-frame.ts';
import { diffFrames } from '../renderer/internal/frame.ts';
import type { TerminalSize } from '../geometry/types.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { FocusPath } from '../interaction/focus.ts';
import type { Frame, RenderDiff } from '../renderer/index.ts';
import type { RenderCommitCandidate } from './runtime-frame.ts';
import type { TuiContext, TuiRuntimeOptions } from './types.ts';

export function createRuntimeCommitCoordinator<TState, TMessage>(
  options: Pick<TuiRuntimeOptions<TState, TMessage>, 'app' | 'host' | 'theme' | 'initialFocus'>,
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

  const coordinator = {
    terminalSize: () => currentTerminalSize,
    render: committedRender,
    renderOrUndefined: () => currentRender,
    frame() {
      if (currentRender === undefined) throw new Error('TUI runtime does not have a frame.');
      return currentRender.frame;
    },
    focusPath: () => currentFocusPath,
    suspendOutput() {
      outputSuspended = true;
      outputBaselineKnown = false;
    },
    resumeOutput() {
      outputSuspended = false;
      outputBaselineKnown = false;
    },
    async initial(state: TState, context: TuiContext, stateVersion: number) {
      const theme = resolveTuiTheme(options.theme, state);
      const resolution = resolveCandidate(
        state,
        context,
        theme,
        currentFocusPath,
        focusReturnPaths,
        pendingInitialFocus,
        stateVersion,
        candidateCommitId()
      );
      const diff = await write(undefined, resolution.render, theme);
      accept(resolution, currentTerminalSize);
      pendingInitialFocus = undefined;
      return { render: resolution.render, diff, diagnostics: resolution.diagnostics };
    },
    async transition(
      state: TState,
      context: TuiContext,
      terminalSize: TerminalSize,
      requestedFocusPath: FocusPath | undefined,
      stateVersion: number,
      focus?: TuiRuntimeOptions<TState, TMessage>['initialFocus']
    ) {
      const theme = resolveTuiTheme(options.theme, state);
      const previousFrame = frameDiffBase(theme.fingerprint);
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
      const diff = await write(previousFrame, resolution.render, theme);
      accept(resolution, terminalSize);
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
    theme: RenderCommitCandidate<TMessage>['theme']
  ): Promise<RenderDiff> {
    if (outputSuspended) return diffFrames(previousFrame, render.frame);
    try {
      const dirtyRegions = previousFrame === undefined
        ? undefined
        : dirtyRegionsForRenderCommit(currentRender, render);
      const diff = await commitFrame(options.host, previousFrame, render.frame, theme, {
        ...(dirtyRegions === undefined ? {} : { dirtyRegions }),
        signal
      });
      outputBaselineKnown = true;
      return diff;
    } catch (cause) {
      if (terminalWriteWasIndeterminate(cause)) outputBaselineKnown = false;
      throw cause;
    }
  }

  function accept(resolution: RuntimeRenderResolution<TMessage>, terminalSize: TerminalSize): void {
    currentTerminalSize = terminalSize;
    currentRender = resolution.render;
    currentFocusPath = resolution.focusPath;
    focusReturnPaths = [...resolution.focusReturnPaths];
    nextCommitSequence += 1;
  }

  function frameDiffBase(themeFingerprint: string): Frame | undefined {
    return outputBaselineKnown && currentRender?.themeFingerprint === themeFingerprint
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
      commitId
    );
    if (initialFocus !== undefined) {
      const resolution = resolveInitialFocusSelector(render.layout, initialFocus);
      if (resolution.kind === 'matched' && !sameFocusPath(resolution.path, render.frame.focusPath)) {
        desiredFocusPath = resolution.path;
        render = renderCurrentFrame(
          options.app,
          state,
          context,
          desiredFocusPath,
          theme,
          stateVersion,
          commitId
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
      && !sameFocusPath(render.frame.focusPath, desiredFocusPath)
    ) {
      const recovered = renderCurrentFrame(
        options.app,
        state,
        context,
        focusReturnPath,
        theme,
        stateVersion,
        commitId
      );
      if (sameFocusPath(recovered.frame.focusPath, focusReturnPath)) render = recovered;
    }
    if (
      desiredFocusPath !== undefined
      && render.frame.focusPath !== undefined
      && !sameFocusPath(render.frame.focusPath, desiredFocusPath)
      && findAnyLayoutFocusTarget(render.layout, desiredFocusPath) !== undefined
      && activeFocusScopeRestores(render.layout)
      && !nextReturnPaths.some((path) => sameFocusPath(path, desiredFocusPath))
    ) {
      nextReturnPaths.push([...desiredFocusPath]);
    }
    if (nextReturnPaths.length > 0 && sameFocusPath(render.frame.focusPath, nextReturnPaths.at(-1))) {
      nextReturnPaths = nextReturnPaths.slice(0, -1);
    }
    return {
      render,
      ...(render.frame.focusPath === undefined ? {} : { focusPath: render.frame.focusPath }),
      focusReturnPaths: nextReturnPaths,
      diagnostics
    };
  }
}

interface RuntimeRenderResolution<TMessage> {
  readonly render: RenderCommitCandidate<TMessage>;
  readonly focusPath?: FocusPath;
  readonly focusReturnPaths: readonly FocusPath[];
  readonly diagnostics: readonly TerminalDiagnostic[];
}

function sameFocusPath(left: FocusPath | undefined, right: FocusPath | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
