import { rgb, themePackDefinition } from './shared.ts';

export const tokyoNightThemeDefinition = themePackDefinition('tokyo-night', {
  'app.background': rgb(26, 27, 38),
  'app.foreground': rgb(192, 202, 245),
  'surface.background': rgb(22, 22, 30),
  'surface.border': rgb(65, 72, 104),
  'surface.title': rgb(125, 207, 255),
  'text.default': rgb(192, 202, 245),
  'text.muted': rgb(122, 162, 247),
  'accent.primary': rgb(187, 154, 247),
  'accent.secondary': rgb(125, 207, 255),
  'status.info': rgb(125, 207, 255),
  'status.success': rgb(158, 206, 106),
  'status.warning': rgb(224, 175, 104),
  'status.error': rgb(247, 118, 142),
  'selection.background': rgb(41, 46, 66),
  'focus.border': rgb(125, 207, 255),
  'menu.match': rgb(187, 154, 247),
  'chart.series.1': rgb(158, 206, 106),
  'chart.series.2': rgb(122, 162, 247),
  'chart.series.3': rgb(187, 154, 247)
});
