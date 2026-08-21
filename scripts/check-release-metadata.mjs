import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await readFile(new URL('../jsr.json', import.meta.url), 'utf8'));
const packageName = '@ismail-elkorchi/terminal-ui';
const repositoryUrl = 'git+https://github.com/Ismail-elkorchi/terminal-ui.git';
const failures = [];

if (packageJson.name !== packageName) failures.push(`package.json name must be ${packageName}.`);
if (jsrJson.name !== packageName) failures.push(`jsr.json name must be ${packageName}.`);
if (packageJson.version !== jsrJson.version) {
  failures.push('package.json and jsr.json versions must match.');
}
if (typeof packageJson.version !== 'string' || !isSemanticVersion(packageJson.version)) {
  failures.push('Package version must be a valid semantic version.');
}
if (packageJson.private === true) failures.push('The release package must not be private.');
if (packageJson.publishConfig?.access !== 'public') {
  failures.push('npm publication must use public access.');
}
if (packageJson.publishConfig?.registry !== 'https://registry.npmjs.org/') {
  failures.push('npm publication must target the public npm registry.');
}
if (packageJson.repository?.url !== repositoryUrl) {
  failures.push(`package.json repository URL must be ${repositoryUrl} for npm provenance.`);
}

const releaseTag = process.env['RELEASE_TAG'];
if (releaseTag !== undefined && releaseTag !== `v${String(packageJson.version)}`) {
  failures.push(`Release tag ${releaseTag} does not match v${String(packageJson.version)}.`);
}

if (failures.length > 0) throw new Error(`Release metadata is invalid:\n${failures.join('\n')}`);
process.stdout.write(`${packageName}@${String(packageJson.version)} release metadata is valid.\n`);

function isSemanticVersion(value) {
  const match = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(value);
  if (match === null) return false;
  return match.groups?.['prerelease']?.split('.').every((identifier) =>
    !/^\d+$/u.test(identifier) || identifier === '0' || !identifier.startsWith('0')) ?? true;
}
