export function progressTone(value) {
  if (value >= 92) return 'success';
  if (value < 75) return 'warning';
  return 'running';
}

export function compactViewport(viewport) {
  return viewport.columns < 150;
}
