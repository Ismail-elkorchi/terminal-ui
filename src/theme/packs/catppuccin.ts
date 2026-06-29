import { rgb, themePackDefinition } from './shared.ts';

export const catppuccinThemeDefinition = themePackDefinition('catppuccin', {
  'app.background': rgb(30, 30, 46),
  'app.foreground': rgb(205, 214, 244),
  'surface.background': rgb(24, 24, 37),
  'surface.foreground': rgb(205, 214, 244),
  'surface.border': rgb(88, 91, 112),
  'surface.title': rgb(137, 180, 250),
  'text.default': rgb(205, 214, 244),
  'text.muted': rgb(147, 153, 178),
  'text.strong': rgb(243, 244, 255),
  'accent.primary': rgb(203, 166, 247),
  'accent.secondary': rgb(137, 220, 235),
  'status.info': rgb(137, 220, 235),
  'status.success': rgb(166, 227, 161),
  'status.warning': rgb(249, 226, 175),
  'status.error': rgb(243, 139, 168),
  'selection.background': rgb(69, 71, 90),
  'focus.border': rgb(137, 180, 250),
  'menu.match': rgb(245, 194, 231),
  'chart.series.1': rgb(166, 227, 161),
  'chart.series.2': rgb(137, 180, 250),
  'chart.series.3': rgb(203, 166, 247)
});
