import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  column,
  defineTui,
  helpBar,
  image as terminalImage,
  rasterImage,
  runTui,
  text,
} from '@ismail-elkorchi/terminal-ui';

const width = 96;
const height = 48;
const pixels = new Uint8Array(width * height * 3);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    pixels[offset] = Math.round(x * 255 / (width - 1));
    pixels[offset + 1] = Math.round(y * 255 / (height - 1));
    pixels[offset + 2] = 180;
  }
}

const gradient = rasterImage({ width, height, format: 'rgb8', data: pixels });
const quitKey = { kind: 'key', key: 'q' } as const;

export const graphicsApp = defineTui<undefined, 'quit'>({
  id: 'graphics-example',
  init: () => ({ state: undefined }),
  update: (state) => ({ state, exit: { reason: 'quit' } }),
  view: () => column([
    text({ id: 'graphics-title', content: 'Kitty/SIXEL raster graphics with terminal fallback', textRole: 'title' }),
    terminalImage({
      id: 'graphics-gradient',
      image: gradient,
      label: 'A blue, red, and green gradient',
      fallback: 'Gradient preview (terminal graphics unavailable)',
      fit: 'contain',
      measurement: {
        minWidth: 12,
        minHeight: 4,
        preferredWidth: 48,
        preferredHeight: 12,
      },
    }),
    helpBar({
      id: 'graphics-help',
      groups: [{ id: 'graphics-actions', bindings: [{ binding: quitKey, label: 'quit' }] }],
    }),
  ], {
    id: 'graphics-root',
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }],
    meta: { accessibility: { role: 'application', label: 'Terminal graphics example' } },
  }),
  inputBindings: [{
    id: 'quit',
    triggers: [quitKey, { kind: 'text', text: 'q' }],
    message: 'quit',
  }],
  nonTty: { mode: 'last_frame' },
});

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const exit = await runTui(graphicsApp, { graphics: 'auto' });
  if (exit.status !== 'completed') process.exitCode = 1;
}
