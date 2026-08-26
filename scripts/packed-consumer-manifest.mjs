export function createPackedConsumerManifest(source, terminalUiTarball, componentTarball) {
  const manifest = JSON.parse(source);
  const dependencies = manifest.dependencies;
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    throw new TypeError('Packed consumer manifest must define dependencies.');
  }

  return `${JSON.stringify({
    ...manifest,
    dependencies: {
      ...dependencies,
      '@ismail-elkorchi/terminal-ui': `file:${terminalUiTarball}`,
      'terminal-ui-peer-component-fixture': `file:${componentTarball}`
    }
  }, null, 2)}\n`;
}
