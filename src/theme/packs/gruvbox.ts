import { rgb, themePackDefinition } from './shared.ts';

export const gruvboxThemeDefinition = themePackDefinition('gruvbox', {
  'app.background': rgb(40, 40, 40),
  'app.foreground': rgb(235, 219, 178),
  'surface.background': rgb(50, 48, 47),
  'surface.border': rgb(102, 92, 84),
  'surface.title': rgb(250, 189, 47),
  'text.default': rgb(235, 219, 178),
  'text.muted': rgb(168, 153, 132),
  'accent.primary': rgb(250, 189, 47),
  'accent.secondary': rgb(211, 134, 155),
  'status.info': rgb(131, 165, 152),
  'status.success': rgb(184, 187, 38),
  'status.warning': rgb(250, 189, 47),
  'status.error': rgb(251, 73, 52),
  'selection.background': rgb(60, 56, 54),
  'focus.border': rgb(142, 192, 124),
  'menu.match': rgb(211, 134, 155),
  'chart.series.1': rgb(184, 187, 38),
  'chart.series.2': rgb(131, 165, 152),
  'chart.series.3': rgb(211, 134, 155)
});
