import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const RELEASE_REPOSITORY = 'SamiKamara/RevolaMapDrawer';
export const PACKAGE_DIRECTORY = 'RevolaMapDrawer-win32-x64';
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function requireVersion(version) {
  assert.ok(typeof version === 'string' && VERSION_PATTERN.test(version), 'Version must use MAJOR.MINOR.PATCH without leading zeros or a prerelease suffix.');
  return version;
}

export function releaseAssetName(version) {
  return `RevolaMapDrawer-${requireVersion(version)}-win-x64.zip`;
}

export function validateReleaseMetadata({ packageJson, packageLock, changelog, version, tag }) {
  requireVersion(version);
  assert.equal(packageJson.version, version, 'Requested version must match package.json.');
  assert.equal(packageLock.version, version, 'Requested version must match package-lock.json.');
  assert.equal(packageLock.packages?.['']?.version, version, 'Lockfile root package version must match.');
  if (tag !== undefined) assert.equal(tag, `v${version}`, 'Tag must exactly match vMAJOR.MINOR.PATCH and the package version.');
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\r?$/gm)].filter(match => match[1] === version);
  assert.equal(headings.length, 1, 'CHANGELOG.md must contain exactly one dated heading for this version.');
  const heading = headings[0];
  assert.equal(new Date(`${heading[2]}T00:00:00Z`).toISOString().slice(0, 10), heading[2], 'Changelog date must be a real calendar date.');
  const remainder = changelog.slice(heading.index + heading[0].length);
  const notes = remainder.split(/^## /m, 1)[0].trim();
  assert.ok(notes.length > 0 && !/^\s*(?:TBD|TODO|pending)\s*$/i.test(notes), 'Release notes must be populated.');
  return { version, tag: `v${version}`, date: heading[2], notes, assetName: releaseAssetName(version) };
}

export function validateGitReleaseState({ branch, status, head, remoteMain, origin, localTagExists, remoteTagExists }) {
  assert.equal(branch, 'main', 'Release tagging requires main.');
  assert.equal(status.trim(), '', 'Release tagging requires a clean worktree, including untracked files.');
  assert.ok(head && head === remoteMain, 'Local main must exactly match freshly fetched origin/main.');
  validateReleaseOrigin(origin);
  assert.equal(localTagExists, false, 'The local version tag already exists; never move or recreate a release tag.');
  assert.equal(remoteTagExists, false, 'The remote version tag already exists; never move or recreate a release tag.');
}

export function validateReleaseOrigin(origin) {
  assert.ok([
    `https://github.com/${RELEASE_REPOSITORY}.git`, `https://github.com/${RELEASE_REPOSITORY}`,
    `git@github.com:${RELEASE_REPOSITORY}.git`, `ssh://git@github.com/${RELEASE_REPOSITORY}.git`,
  ].includes(origin), `origin must point to ${RELEASE_REPOSITORY}.`);
}

export function validateExistingTagState({ status, head, localTagCommit, remoteTagCommit, origin }) {
  validateReleaseOrigin(origin);
  assert.equal(status.trim(), '', 'Uploading a draft requires a clean worktree, including untracked files.');
  assert.ok(head && localTagCommit === head, 'Check out the exact tagged source before uploading release assets.');
  assert.equal(remoteTagCommit, head, 'Remote release tag must identify the checked-out source commit.');
}

export function isRuntimePath(candidate) {
  const name = candidate.replaceAll('\\', '/').replace(/^\//, '');
  if (!name) return true;
  if (name.split('/').some(part => !part || part === '.' || part === '..')) return false;
  if (['index.html', 'package.json', 'src', 'electron', 'assets'].includes(name)) return true;
  return /^(src\/[a-zA-Z0-9_-]+\.(?:js|css)|electron\/[a-zA-Z0-9_-]+\.cjs|assets\/[a-zA-Z0-9_-]+\.(?:png|js))$/.test(name);
}

export function runtimeManifest(packageJson) {
  return Object.fromEntries(['name', 'version', 'description', 'type', 'main'].map(key => [key, packageJson[key]]));
}

export function portableReadme(version) {
  requireVersion(version);
  return `Revola Map Drawer ${version}\n\nA specialized offline map editor for Revola: Post Hyper.\nIt is not a general-purpose drawing tool.\n\nWindows x64 portable application\n1. Extract the entire ZIP into a normal folder.\n2. Open RevolaMapDrawer.exe in this folder.\n3. Keep all files and subfolders together. No installation, Node.js,\n   development server or internet connection is needed to run the editor.\n\nSave wall PNG or Save project to preserve editable maps. Wall SVG and\nfloor PNG/SVG are image exports without editable project data.\n\nThis executable is not Authenticode-signed.\nRead adjacent DISTRIBUTION.md for application/artwork distribution status.\nThird-party runtime licenses: LICENSE, LICENSES.chromium.html and\nTHIRD-PARTY-NOTICES.txt in this folder.\n\nVerify the downloaded ZIP against its SHA256SUMS.txt before extracting.\nFull instructions and limitations:\nhttps://github.com/${RELEASE_REPOSITORY}/blob/main/README.md\nRelease process:\nhttps://github.com/${RELEASE_REPOSITORY}/blob/main/docs/RELEASING.md\n`;
}

export function portableDistributionNotice(source) {
  // Distribution.md is moved one directory up in the portable folder. Canonical
  // online links keep its full reference documentation reachable without copying
  // machine evidence, generated reference images or the entire source tree.
  return source.replace(/\]\(([^)]+)\)/g, (match, target) => {
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) return match;
    return `](${new URL(target, `https://github.com/${RELEASE_REPOSITORY}/blob/main/docs/`).href})`;
  });
}

export function containedReleaseDirectory(repositoryRoot, version, directory) {
  requireVersion(version);
  const base = path.resolve(repositoryRoot, 'artifacts', 'release');
  const resolved = path.resolve(directory ?? path.join(base, `v${version}`));
  const relative = path.relative(base, resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Release output must be a child directory of artifacts/release.');
  return resolved;
}

export async function readReleaseMetadata(root, version, tag) {
  const [packageJson, packageLock, changelog] = await Promise.all([
    fs.readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(root, 'package-lock.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
  ]);
  return validateReleaseMetadata({ packageJson, packageLock, changelog, version: version ?? packageJson.version, tag });
}

export async function verifyPackagedSource(root, packageDirectory) {
  const { extractFile, listPackage } = await import('@electron/asar');
  const archive = path.join(packageDirectory, 'resources', 'app.asar');
  const entries = listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
  for (const entry of entries) assert.ok(isRuntimePath(entry), `Unexpected file in application archive: ${entry}`);
  const files = ['index.html'];
  for (const directory of ['src', 'electron', 'assets']) {
    for (const item of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${item.name}`;
      if (item.isFile() && isRuntimePath(relative)) files.push(relative);
    }
  }
  assert.deepEqual(entries.filter(entry => !['src', 'electron', 'assets', 'package.json'].includes(entry)).sort(), [...files].sort(), 'Application archive must contain exactly the maintained runtime files.');
  for (const file of files) assert.ok((await fs.readFile(path.join(root, file))).equals(extractFile(archive, file)), `Stale packaged source: ${file}`);
  const sourceManifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(JSON.parse(extractFile(archive, 'package.json')), runtimeManifest(sourceManifest), 'Packaged manifest must contain the exact version and only runtime metadata.');
  assert.equal(await fs.readFile(path.join(packageDirectory, 'README.txt'), 'utf8'), portableReadme(sourceManifest.version), 'Portable launch instructions must match this version.');
  assert.equal(await fs.readFile(path.join(packageDirectory, 'DISTRIBUTION.md'), 'utf8'), portableDistributionNotice(await fs.readFile(path.join(root, 'docs', 'DISTRIBUTION.md'), 'utf8')), 'Packaged distribution notice must match the current maintained notice.');
  for (const file of ['RevolaMapDrawer.exe', 'LICENSE', 'LICENSES.chromium.html', 'THIRD-PARTY-NOTICES.txt']) {
    assert.ok((await fs.stat(path.join(packageDirectory, file))).size > 0, `Required portable file missing or empty: ${file}`);
  }
  return { version: sourceManifest.version, files: files.length, archiveEntries: entries.length };
}

export async function sha256(file) {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyChecksums(directory, version) {
  const assetName = releaseAssetName(version);
  const content = await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8');
  const actual = await sha256(path.join(directory, assetName));
  assert.equal(content.trim(), `${actual}  ${assetName}`, 'SHA256SUMS.txt must contain exactly the matching portable ZIP checksum.');
  return actual;
}
