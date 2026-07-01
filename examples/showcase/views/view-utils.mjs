export function progressTone(value) {
  if (value >= 92) return 'success';
  if (value < 75) return 'warning';
  return 'running';
}

export function compactViewport(viewport) {
  return viewport.columns < 150;
}

export function densityRole(value) {
  if (value <= 2) return 'compact';
  if (value >= 4) return 'spacious';
  return 'normal';
}
