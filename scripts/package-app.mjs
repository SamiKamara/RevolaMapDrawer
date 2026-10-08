import { packager } from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRuntimePath, portableReadme, portableDistributionNotice, runtimeManifest, verifyPackagedSource } from './release-utils.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
// Only the files required by the offline application enter app.asar. Git data,
// tests, original references, personal files and future repository metadata stay out.
const builds = await packager({
  dir: root, name: 'RevolaMapDrawer', platform: 'win32', arch: 'x64',
  out: path.join(root, 'dist'), overwrite: true, asar: true, prune: false,
  appVersion: manifest.version, electronVersion: manifest.devDependencies.electron,
  win32metadata: { CompanyName: 'SamiKamara', ProductName: 'Revola Map Drawer',
    FileDescription: manifest.description, OriginalFilename: 'RevolaMapDrawer.exe' },
  ignore: candidate => !isRuntimePath(candidate),
  sanitizePackageJson: [runtimeManifest],
});
for (const directory of builds) {
  await fs.copyFile(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE-RevolaMapDrawer.txt'));
  await fs.writeFile(path.join(directory, 'README.txt'), portableReadme(manifest.version));
  await fs.writeFile(path.join(directory, 'DISTRIBUTION.md'), portableDistributionNotice(await fs.readFile(path.join(root, 'docs', 'DISTRIBUTION.md'), 'utf8')));
  await fs.writeFile(path.join(directory, 'THIRD-PARTY-NOTICES.txt'), `Third-party notices for Revola Map Drawer ${manifest.version}\n\nRevola Map Drawer application source and documentation: MIT license,\nCopyright (c) 2026 SamiKamara. See LICENSE-RevolaMapDrawer.txt and preserve\nits copyright and permission notice in copies or substantial portions.\n\nBundled Electron runtime: ${manifest.devDependencies.electron}\nElectron's MIT license is reproduced in the adjacent LICENSE file.\nChromium and other bundled runtime notices are reproduced in the adjacent\nLICENSES.chromium.html file. Both files are retained unchanged from Electron.\n\nDevelopment dependencies are not included in app.asar. Supplied game/reference\nartwork has separate distribution status; see DISTRIBUTION.md. The application\nand Electron licenses do not grant rights to that artwork or the Revola game.\n`);
  console.log(JSON.stringify({ directory, ...await verifyPackagedSource(root, directory) }));
}
