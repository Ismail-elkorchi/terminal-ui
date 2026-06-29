import { rgb, themePackDefinition } from './shared.ts';

export const solarizedThemeDefinition = themePackDefinition('solarized', {
  'app.background': rgb(0, 43, 54),
  'app.foreground': rgb(238, 232, 213),
  'surface.background': rgb(7, 54, 66),
  'surface.border': rgb(88, 110, 117),
  'surface.title': rgb(38, 139, 210),
  'text.default': rgb(238, 232, 213),
  'text.muted': rgb(147, 161, 161),
  'accent.primary': rgb(38, 139, 210),
  'accent.secondary': rgb(211, 54, 130),
  'status.info': rgb(42, 161, 152),
  'status.success': rgb(133, 153, 0),
  'status.warning': rgb(181, 137, 0),
  'status.error': rgb(220, 50, 47),
  'selection.background': rgb(7, 54, 66),
  'focus.border': rgb(42, 161, 152),
  'menu.match': rgb(211, 54, 130),
  'chart.series.1': rgb(133, 153, 0),
  'chart.series.2': rgb(38, 139, 210),
  'chart.series.3': rgb(211, 54, 130)
});
