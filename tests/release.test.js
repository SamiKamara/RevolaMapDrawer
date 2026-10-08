import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createPackage, uncache } from '@electron/asar';
import {
  containedReleaseDirectory, isRuntimePath, portableDistributionNotice, portableReadme,
  releaseAssetName, runtimeManifest, sha256, validateExistingTagState, validateGitReleaseState,
  validateReleaseMetadata, verifyChecksums, verifyPackagedSource,
} from '../scripts/release-utils.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const metadata = () => ({ version: '0.10.2', packageJson: { version: '0.10.2' },
  packageLock: { version: '0.10.2', packages: { '': { version: '0.10.2' } } },
  changelog: '## [Unreleased]\n\n## [0.10.2] - 2026-10-08\n\n- Prepared Windows distribution.\n\n## [0.10.1] - 2026-10-08\n\n- Older notes.\n' });
const gitState = () => ({ branch: 'main', status: '', head: 'release-commit', remoteMain: 'release-commit',
  origin: 'https://github.com/SamiKamara/RevolaMapDrawer.git', localTagExists: false, remoteTagExists: false });

test('release metadata agrees with package, lockfile, exact tag and dated populated notes', () => {
  const info = validateReleaseMetadata({ ...metadata(), tag: 'v0.10.2' });
  assert.equal(info.notes, '- Prepared Windows distribution.');
  assert.equal(info.assetName, 'RevolaMapDrawer-0.10.2-win-x64.zip');
  assert.equal(info.date, '2026-10-08');
  assert.doesNotThrow(() => validateReleaseMetadata({ ...metadata(), changelog: metadata().changelog.replaceAll('\n', '\r\n') }));
  for (const version of ['01.2.3', '1.02.3', '1.2.03', 'v1.2.3', '1.2', '1.2.3-beta', '../1.2.3']) {
    assert.throws(() => releaseAssetName(version));
  }
});

test('release metadata rejects every version source mismatch and malformed changelog', () => {
  assert.throws(() => validateReleaseMetadata({ ...metadata(), version: '0.10.3' }), /package.json/);
  assert.throws(() => validateReleaseMetadata({ ...metadata(), tag: 'v0.10.1' }), /Tag/);
  for (const property of ['version', 'root']) {
    const invalid = metadata();
    if (property === 'version') invalid.packageLock.version = '0.10.1';
    else invalid.packageLock.packages[''].version = '0.10.1';
    assert.throws(() => validateReleaseMetadata(invalid));
  }
  for (const changelog of ['## [0.10.2]\n\n- Notes.', '## [0.10.2] - 2026-02-30\n\n- Notes.',
    '## [0.10.2] - 2026-10-08\n\n', '## [0.10.2] - 2026-10-08\n\nTODO',
    metadata().changelog + '\n## [0.10.2] - 2026-10-08\n\nDuplicate']) {
    assert.throws(() => validateReleaseMetadata({ ...metadata(), changelog }));
  }
});

test('new release tagging rejects dirty/untracked work, wrong branch, stale main and existing tags', () => {
  assert.doesNotThrow(() => validateGitReleaseState(gitState()));
  for (const override of [{ branch: 'feature' }, { branch: '' }, { status: ' M src/app.js' },
    { status: '?? local-private-file.txt' }, { remoteMain: 'newer-commit' }, { head: '' },
    { localTagExists: true }, { remoteTagExists: true }, { origin: 'https://github.com/other/RevolaMapDrawer.git' }]) {
    assert.throws(() => validateGitReleaseState({ ...gitState(), ...override }));
  }
  assert.doesNotThrow(() => validateGitReleaseState({ ...gitState(), origin: 'git@github.com:SamiKamara/RevolaMapDrawer.git' }));
});

test('draft upload accepts only clean exact local/remote tagged source and canonical origin', () => {
  const state = { status: '', head: 'commit', localTagCommit: 'commit', remoteTagCommit: 'commit', origin: gitState().origin };
  assert.doesNotThrow(() => validateExistingTagState(state));
  for (const override of [{ status: ' M src/app.js' }, { status: '?? local-map.revola.json' },
    { localTagCommit: 'other' }, { remoteTagCommit: 'other' }, { head: '' },
    { origin: 'https://github.com/SamiKamara/ModularGameOverlay.git' }]) {
    assert.throws(() => validateExistingTagState({ ...state, ...override }));
  }
});

test('production allowlist rejects repository metadata, originals, dependencies and future stray files', () => {
  for (const name of ['', '/src', '/src/app.js', '\\electron\\preload.cjs', '/assets/ship.png', '/assets/ship-floor-contour.js', 'package.json', 'index.html']) {
    assert.equal(isRuntimePath(name), true, name);
  }
  for (const name of ['.git/config', '.github/workflows/release.yml', 'AGENTS.md', 'README.md', 'docs/DESIGN.md',
    'tests/model.test.js', 'scripts/package-app.mjs', 'package-lock.json', 'node_modules/electron/package.json',
    'RevolaCandiMapASample.png', 'alustava toteutusohje.txt', 'personal.revola.json', 'src/../private.js',
    'assets/.private.js', 'src/nested/private.js', 'src/.env.js', 'dist/RevolaMapDrawer.exe']) {
    assert.equal(isRuntimePath(name), false, name);
  }
  assert.deepEqual(runtimeManifest({ name: 'app', version: '1.2.3', description: 'specialized tool', type: 'module',
    main: 'electron/main.cjs', scripts: { package: 'private-path' }, devDependencies: { electron: '1' }, private: true }),
  { name: 'app', version: '1.2.3', description: 'specialized tool', type: 'module', main: 'electron/main.cjs' });
});

test('release output paths stay within the generated release directory', () => {
  assert.equal(containedReleaseDirectory(root, '0.10.2'), path.join(root, 'artifacts', 'release', 'v0.10.2'));
  assert.equal(containedReleaseDirectory(root, '0.10.2', path.join(root, 'artifacts', 'release', 'test-output')), path.join(root, 'artifacts', 'release', 'test-output'));
  for (const directory of [root, path.join(root, 'artifacts', 'release'), path.join(root, 'artifacts', 'release-sibling'),
    path.join(root, 'artifacts', 'release', '..', '..', 'source')]) {
    assert.throws(() => containedReleaseDirectory(root, '0.10.2', directory));
  }
});

test('portable instructions are self-contained and notice references point to canonical source docs', () => {
  assert.match(portableReadme('0.10.2'), /Revola: Post Hyper/);
  assert.match(portableReadme('0.10.2'), /Extract the entire ZIP/);
  assert.match(portableReadme('0.10.2'), /not Authenticode-signed/);
  assert.equal(portableDistributionNotice('[source](REFERENCE_ANALYSIS.md) [root](../README.md) [web](https://example.com) [anchor](#rights)'),
    '[source](https://github.com/SamiKamara/RevolaMapDrawer/blob/main/docs/REFERENCE_ANALYSIS.md) [root](https://github.com/SamiKamara/RevolaMapDrawer/blob/main/README.md) [web](https://example.com) [anchor](#rights)');
});

test('checksums reject changed ZIP bytes and unexpected checksum entries', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'revola-checksums-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const asset = releaseAssetName('0.10.2'), file = path.join(directory, asset);
  await fs.writeFile(file, 'portable zip bytes');
  const line = `${await sha256(file)}  ${asset}\n`;
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), line);
  assert.equal(await verifyChecksums(directory, '0.10.2'), await sha256(file));
  await fs.appendFile(file, 'tampered');
  await assert.rejects(verifyChecksums(directory, '0.10.2'), /checksum/);
  await fs.writeFile(file, 'portable zip bytes');
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), line + line);
  await assert.rejects(verifyChecksums(directory, '0.10.2'), /exactly/);
});

test('ASAR verification detects stale source, development metadata and stray packaged files', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'revola-asar-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'), stage = path.join(directory, 'stage'), packaged = path.join(directory, 'package');
  const packageJson = { name: 'revola-test', version: '0.10.2', description: 'Test', type: 'module', main: 'electron/main.cjs', scripts: { test: 'node test' } };
  for (const folder of ['src', 'assets', 'electron', 'docs']) await fs.mkdir(path.join(source, folder), { recursive: true });
  for (const folder of ['src', 'assets', 'electron']) await fs.mkdir(path.join(stage, folder), { recursive: true });
  await fs.mkdir(path.join(packaged, 'resources'), { recursive: true });
  const files = ['index.html', 'src/app.js', 'assets/ship.png', 'electron/main.cjs'];
  for (const file of files) {
    await fs.writeFile(path.join(source, file), `original ${file}`);
    await fs.copyFile(path.join(source, file), path.join(stage, file));
  }
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify(packageJson));
  await fs.writeFile(path.join(source, 'docs', 'DISTRIBUTION.md'), 'Distribution status [notes](RELEASING.md).');
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(runtimeManifest(packageJson)));
  await fs.writeFile(path.join(packaged, 'README.txt'), portableReadme('0.10.2'));
  await fs.writeFile(path.join(packaged, 'DISTRIBUTION.md'), portableDistributionNotice(await fs.readFile(path.join(source, 'docs', 'DISTRIBUTION.md'), 'utf8')));
  for (const file of ['RevolaMapDrawer.exe', 'LICENSE', 'LICENSES.chromium.html', 'THIRD-PARTY-NOTICES.txt']) await fs.writeFile(path.join(packaged, file), 'fixture');
  const archive = path.join(packaged, 'resources', 'app.asar');
  const rebuild = async () => { await createPackage(stage, archive); uncache(archive); };
  await rebuild();
  assert.equal((await verifyPackagedSource(source, packaged)).files, files.length);
  await fs.writeFile(path.join(source, 'src', 'app.js'), 'changed source');
  await assert.rejects(verifyPackagedSource(source, packaged), /Stale packaged source/);
  await fs.writeFile(path.join(source, 'src', 'app.js'), 'original src/app.js');
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(packageJson)); await rebuild();
  await assert.rejects(verifyPackagedSource(source, packaged), /only runtime metadata/);
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(runtimeManifest(packageJson)));
  await fs.writeFile(path.join(stage, 'AGENTS.md'), 'private development metadata'); await rebuild();
  await assert.rejects(verifyPackagedSource(source, packaged), /Unexpected file/);
});

test('portable ZIP verifier checks every archive file even when its outer checksum is valid', { skip: process.platform !== 'win32' }, async t => {
  const directory = containedReleaseDirectory(root, '0.10.2', path.join(root, 'artifacts', 'release', `test-${process.pid}-${Date.now()}`));
  const packageDirectory = path.join(directory, 'fixture-package');
  await fs.mkdir(path.join(packageDirectory, 'resources'), { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(packageDirectory, 'RevolaMapDrawer.exe'), 'test executable bytes');
  await fs.writeFile(path.join(packageDirectory, 'resources', 'app.asar'), 'test runtime bytes');
  const zip = path.join(directory, releaseAssetName('0.10.2'));
  const generator = path.join(directory, 'fixture.ps1');
  await fs.writeFile(generator, 'param([string]$PackageDirectory, [string]$Zip)\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::CreateFromDirectory($PackageDirectory, $Zip, [IO.Compression.CompressionLevel]::Optimal, $true)\n');
  const create = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', generator, '-PackageDirectory', packageDirectory, '-Zip', zip], { encoding: 'utf8', windowsHide: true });
  assert.equal(create.status, 0, create.stderr);
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${await sha256(zip)}  ${path.basename(zip)}\n`);
  const verify = () => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'verify-release-archive.ps1'), '-Version', '0.10.2', '-OutputDirectory', directory, '-PackageDirectory', packageDirectory], { encoding: 'utf8', windowsHide: true });
  const valid = verify(); assert.equal(valid.status, 0, valid.stderr);
  await fs.writeFile(path.join(packageDirectory, 'resources', 'app.asar'), 'changed source after compression');
  const stale = verify(); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /differs from verified package/);
  await fs.writeFile(path.join(packageDirectory, 'resources', 'app.asar'), 'test runtime bytes');
  await fs.writeFile(path.join(packageDirectory, 'resources', 'missing.dll'), 'new file not present in ZIP');
  const missing = verify(); assert.notEqual(missing.status, 0); assert.match(missing.stderr, /missing packaged files/);
});
