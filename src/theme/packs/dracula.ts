import { rgb, themePackDefinition } from './shared.ts';

export const draculaThemeDefinition = themePackDefinition('dracula', {
  'app.background': rgb(40, 42, 54),
  'app.foreground': rgb(248, 248, 242),
  'surface.background': rgb(33, 34, 44),
  'surface.border': rgb(98, 114, 164),
  'surface.title': rgb(139, 233, 253),
  'text.default': rgb(248, 248, 242),
  'text.muted': rgb(189, 147, 249),
  'accent.primary': rgb(255, 121, 198),
  'accent.secondary': rgb(139, 233, 253),
  'status.info': rgb(139, 233, 253),
  'status.success': rgb(80, 250, 123),
  'status.warning': rgb(241, 250, 140),
  'status.error': rgb(255, 85, 85),
  'selection.background': rgb(68, 71, 90),
  'focus.border': rgb(139, 233, 253),
  'menu.match': rgb(255, 121, 198),
  'chart.series.1': rgb(80, 250, 123),
  'chart.series.2': rgb(139, 233, 253),
  'chart.series.3': rgb(255, 121, 198)
});
