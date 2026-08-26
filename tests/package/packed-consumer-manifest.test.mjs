import assert from 'node:assert/strict';
import test from 'node:test';
import { createPackedConsumerManifest } from '../../scripts/packed-consumer-manifest.mjs';

const source = JSON.stringify({
  name: 'consumer',
  dependencies: {
    '@ismail-elkorchi/terminal-ui': 'file:placeholder',
    'terminal-ui-peer-component-fixture': 'file:placeholder'
  }
});

test('packed consumer manifest preserves Windows tarball paths as valid JSON', () => {
  const terminalUiTarball = String.raw`C:\Users\runner\terminal-ui.tgz`;
  const componentTarball = String.raw`C:\Users\runner\component.tgz`;
  const manifest = JSON.parse(createPackedConsumerManifest(
    source,
    terminalUiTarball,
    componentTarball
  ));

  assert.equal(
    manifest.dependencies['@ismail-elkorchi/terminal-ui'],
    `file:${terminalUiTarball}`
  );
  assert.equal(
    manifest.dependencies['terminal-ui-peer-component-fixture'],
    `file:${componentTarball}`
  );
});
