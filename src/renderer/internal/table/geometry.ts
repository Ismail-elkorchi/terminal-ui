export interface TableColumnTrack {
  readonly index: number;
  readonly start: number;
  readonly width: number;
  readonly end: number;
}

export function tableColumnTracks(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number
): readonly TableColumnTrack[] {
  let cursor = Math.max(0, markerCells);
  return widths.map((width, index) => {
    if (index > 0) cursor += Math.max(0, separatorCells);
    const normalizedWidth = Math.max(1, Math.floor(width));
    const track = {
      index,
      start: cursor,
      width: normalizedWidth,
      end: cursor + normalizedWidth
    };
    cursor = track.end;
    return track;
  });
}

export function visibleTableTrack(
  track: TableColumnTrack,
  horizontalOffset: number,
  viewportWidth: number
): { readonly start: number; readonly end: number } | undefined {
  const start = Math.max(0, track.start - horizontalOffset);
  const end = Math.min(Math.max(0, viewportWidth), track.end - horizontalOffset);
  return end <= start ? undefined : { start, end };
}
