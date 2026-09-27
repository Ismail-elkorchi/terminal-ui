import { findExecutable } from './files.mjs';

export async function imageMagickCommands() {
  const magick = await findExecutable('magick', false);
  if (magick !== undefined) {
    return {
      import: { executable: magick, arguments: ['import'] },
      identify: { executable: magick, arguments: ['identify'] },
      convert: { executable: magick, arguments: [] },
    };
  }
  return {
    import: { executable: await findExecutable('import'), arguments: [] },
    identify: { executable: await findExecutable('identify'), arguments: [] },
    convert: { executable: await findExecutable('convert'), arguments: [] },
  };
}
