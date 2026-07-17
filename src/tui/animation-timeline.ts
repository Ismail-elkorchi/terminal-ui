export interface AnimationFrame {
  readonly frameIndex: number;
  readonly targetTime: number;
  readonly elapsed: number;
  readonly delta: number;
  readonly droppedFrames: number;
}

export interface AnimationTimeline {
  readonly startedAt: number;
  readonly frameDuration: number;
  readonly lastFrameIndex: number;
  readonly lastFrameTime: number;
}

export function createAnimationTimeline(startedAt: number, fps: number): AnimationTimeline {
  assertFiniteTime(startedAt, 'animation start time');
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('animation fps must be a positive finite number.');
  return {
    startedAt,
    frameDuration: 1_000 / fps,
    lastFrameIndex: -1,
    lastFrameTime: startedAt
  };
}

export function nextAnimationDeadline(timeline: AnimationTimeline): number {
  return timeline.startedAt + (timeline.lastFrameIndex + 2) * timeline.frameDuration;
}

export function advanceAnimationTimeline(
  timeline: AnimationTimeline,
  now: number
): { readonly timeline: AnimationTimeline; readonly frame: AnimationFrame } {
  assertFiniteTime(now, 'animation time');
  const dueIndex = Math.max(
    timeline.lastFrameIndex + 1,
    Math.floor(Math.max(0, now - timeline.startedAt) / timeline.frameDuration) - 1
  );
  const targetTime = timeline.startedAt + (dueIndex + 1) * timeline.frameDuration;
  const frame: AnimationFrame = {
    frameIndex: dueIndex,
    targetTime,
    elapsed: Math.max(0, now - timeline.startedAt),
    delta: Math.max(0, now - timeline.lastFrameTime),
    droppedFrames: Math.max(0, dueIndex - timeline.lastFrameIndex - 1)
  };
  return {
    timeline: {
      ...timeline,
      lastFrameIndex: dueIndex,
      lastFrameTime: now
    },
    frame
  };
}

function assertFiniteTime(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}
