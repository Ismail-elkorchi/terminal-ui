import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  column,
  createTerminalHost,
  defineTui,
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

export const graphicsApp = defineTui<undefined, 'quit'>({
  id: 'graphics-example',
  init: () => undefined,
  update: (state) => ({ state, exit: { reason: 'quit' } }),
  view: () => column([
    text({ content: 'Verified Kitty/SIXEL raster graphics' }),
    terminalImage({
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
    text({ content: 'Press q to quit.' }),
  ]),
  inputBindings: [{
    id: 'quit',
    triggers: [{ kind: 'key', key: 'q' }],
    message: 'quit',
  }],
  nonTty: { mode: 'last_frame' },
});

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const host = createTerminalHost({ runtime: 'node' });
  try {
    const exit = await runTui(graphicsApp, host, { graphics: 'auto' });
    if (exit.status !== 'completed') process.exitCode = 1;
  } finally {
    await host.dispose();
  }
}
