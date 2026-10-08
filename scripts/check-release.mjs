import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { containedReleaseDirectory, PACKAGE_DIRECTORY, readReleaseMetadata, validateExistingTagState, validateGitReleaseState, verifyChecksums, verifyPackagedSource } from './release-utils.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return args[index + 1];
}
function git(arguments_, allowedCodes = [0]) {
  const result = spawnSync('git', arguments_, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (!allowedCodes.includes(result.status)) throw new Error(`git ${arguments_.join(' ')} failed: ${result.error?.message ?? result.stderr.trim()}`);
  return { output: result.stdout.trim(), code: result.status };
}

const info = await readReleaseMetadata(root, option('--version'), option('--tag'));
if (args.includes('--new-tag')) {
  const local = git(['show-ref', '--verify', '--quiet', `refs/tags/${info.tag}`], [0, 1]);
  const remote = git(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${info.tag}`], [0, 2]);
  validateGitReleaseState({
    branch: git(['branch', '--show-current']).output, status: git(['status', '--porcelain=v1', '--untracked-files=all']).output,
    head: git(['rev-parse', 'HEAD']).output, remoteMain: git(['rev-parse', 'origin/main']).output,
    origin: git(['remote', 'get-url', 'origin']).output, localTagExists: local.code === 0, remoteTagExists: remote.code === 0,
  });
}
if (args.includes('--existing-tag')) {
  const head = git(['rev-parse', 'HEAD']).output;
  const tagged = git(['rev-parse', `refs/tags/${info.tag}^{commit}`]).output;
  const remote = git(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${info.tag}`, `refs/tags/${info.tag}^{}`]).output;
  const lines = remote.split(/\r?\n/).map(line => line.split(/\s+/));
  const commit = lines.find(line => line[1]?.endsWith('^{}'))?.[0] ?? lines[0]?.[0];
  validateExistingTagState({ status: git(['status', '--porcelain=v1', '--untracked-files=all']).output,
    head, localTagCommit: tagged, remoteTagCommit: commit, origin: git(['remote', 'get-url', 'origin']).output });
}
if (args.includes('--reachable-main')) git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
if (args.includes('--verify-package')) console.log(JSON.stringify(await verifyPackagedSource(root, path.join(root, 'dist', PACKAGE_DIRECTORY))));
const outputDirectory = option('--output-directory');
if (args.includes('--verify-assets')) console.log(JSON.stringify({ sha256: await verifyChecksums(containedReleaseDirectory(root, info.version, outputDirectory), info.version) }));
if (args.includes('--write-notes')) {
  const directory = containedReleaseDirectory(root, info.version, outputDirectory);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'release-notes.md'), `# Revola Map Drawer ${info.tag}\n\nSpecialized offline map editor for **Revola: Post Hyper**. It is not a general-purpose drawing tool.\n\n${info.notes}\n\nDownload \`${info.assetName}\` and \`SHA256SUMS.txt\`, verify the checksum, extract the entire ZIP, then open \`${PACKAGE_DIRECTORY}/RevolaMapDrawer.exe\`. Windows x64 only; no Node.js, development server or installer is needed. Keep all extracted files together.\n\nThe executable is unsigned. Read the bundled DISTRIBUTION.md for software and artwork distribution status. This automated release is a draft pending owner review.\n`);
}
console.log(JSON.stringify(info));
