# Distribution and asset provenance

Revola Map Drawer is a specialized offline Windows map editor for **Revola: Post Hyper**. Its fixed dimensions, ship and airlock are specific to that game. It is not a general-purpose drawing application.

## Public distribution status

The owner reviewed the prepared project and authorized its public repository and first release on **2026-10-08**. The public repository is [SamiKamara/RevolaMapDrawer](https://github.com/SamiKamara/RevolaMapDrawer), and the first Windows x64 portable release is [v0.10.2](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.2). Release automation continues to create drafts; each later publication requires explicit owner authorization.

The owner selected the standard [MIT License](../LICENSE), copyright **2026 SamiKamara**, for the project's original code, documentation and assets unless separately identified as third-party material. You may use, modify and redistribute the project, including commercially, while retaining its copyright and license notice in copies or substantial portions of the software. The portable application includes this license as `LICENSE-RevolaMapDrawer.txt`. See [the standard MIT terms](https://opensource.org/license/mit) for the notice requirement and warranty disclaimer.

You may use and share maps exported by the application without adding a Revola Map Drawer credit. The software license does not require attribution printed on every output map. This document records material provenance without asserting ownership of the Revola game or third-party materials; third-party components retain their own licenses.

## Project materials

| Material | Provenance and use |
| --- | --- |
| `alustava toteutusohje.txt` | Original Finnish implementation brief, preserved unchanged as a source reference. |
| `RevolaCandiMapASample.png`, `RevolaCandiMapBSample.png` | Original supplied reference maps, preserved unchanged. Used to measure the editor's fixed geometry. Not included in the portable application. |
| `assets/ship.png` | Preserved raster reference derived from supplied Map A with the documented crop and symmetric airlock correction. Since 0.13.0 it is excluded from runtime distributions and exports. See [reference analysis](REFERENCE_ANALYSIS.md). |
| `src/ship-vector.js` | Maintained simplified white ship/airlock geometry derived from the supplied reference, shared by the editor and PNG/SVG wall exports. Bundled as code without raster image embedding. |
| `assets/ship-floor-contour.js` | Maintained runtime geometry derived from the bundled ship image for floor generation. |
| `assets/editor-stars.png` | Supplied editor background artwork, bundled for offline use. It is an editor aid and is excluded from map exports. |
| `assets/object-vectors/*.svg`, `src/object-vectors.js` | Maintained vector traces of the sibling Revola game's current monochrome sprites. `assets/object-vectors/provenance.json` records canonical prefabs, source texture paths/hashes and derived SVG hashes. These are separately identified **Revola game artwork**, not an additional MIT rights grant. Only the vector path module is bundled; raster originals stay in the game checkout. Editor-only visuals never enter exported map pixels/SVG. |
| Source code, documentation and project assets | Project implementation and maintained materials under the MIT License, unless separately identified as third-party material. |

Generated test captures, reference-analysis previews, caches, dependencies and release distributions are excluded from Git. The runtime assets above are maintained application inputs and remain in source control.

To refresh the weapon catalog and object visuals, run Unity's
`Revola.MapManager.MapDrawerVisualExport.Export`, then
`python scripts/trace-object-sprites.py C:/path/to/Revola` in this checkout.
The tracing script requires Pillow, numpy and opencv-python-headless, rejects
colored source pixels and creates pure black/white evenodd vector paths without
embedded images. NPC layers use the actual default animation frame and the
prefab's female controller swaps. The same export reads the prefab's NPC tuning
into `src/npc-defaults.js`; standard generation randomizes state among 0/1/8.
It refreshes the game's trusted weapon catalog JSON and emits `src/weapon-catalog.js`
from both canonical shops, new managed sale flags and English shop localization.
The vector provenance records those shop, localization and definition hashes.
Only NPC-eligible entries enter the NPC picker; every sellable weapon enters the
ground-spawn and crate lists. Rebuild the offline application after this refresh.
No game artwork licensing or publication decision is changed by this local work.

## Third-party runtime notices

The portable Windows application includes Electron and its bundled Chromium, Node.js and other runtime components. Keep the project's `LICENSE-RevolaMapDrawer.txt` and Electron's separate `LICENSE` and `LICENSES.chromium.html` files with the entire application folder. Release builds also include `THIRD-PARTY-NOTICES.txt` identifying the bundled Electron version and these notice files.

The runtime notices apply to their respective third-party components, which are not relicensed by this project's MIT License. This project's license does not grant rights to the Revola game or other separately identified third-party material. Build and test dependencies are pinned in `package-lock.json` and are not shipped as development tools in the portable application.

## Maintaining distribution

- Keep the source, original brief, references and documentation aligned with the documented project scope.
- Retain the project's MIT copyright and license notice and all applicable third-party notices in distributed software copies.
- Review each draft release's version, changelog, complete portable ZIP and SHA-256 checksums before its authorized publication.
- Test the extracted folder on the intended Windows x64 systems. Current automated checks do not establish support for every Windows version or machine.
- Record any code-signing decision. Current builds are unsigned and have no automatic updater.

The release procedure is maintained in [RELEASING.md](RELEASING.md). Current verified checks and limitations are in [CHECKLIST.md](CHECKLIST.md).
