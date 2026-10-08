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
| `assets/ship.png` | Derived from the supplied Map A reference with the documented crop and bounded symmetric airlock correction. Bundled in the application and included in map exports. See [reference analysis](REFERENCE_ANALYSIS.md) for extraction, coordinates and preservation evidence. |
| `assets/ship-floor-contour.js` | Maintained runtime geometry derived from the bundled ship image for floor generation. |
| `assets/editor-stars.png` | Supplied editor background artwork, bundled for offline use. It is an editor aid and is excluded from map exports. |
| Source code, documentation and project assets | Project implementation and maintained materials under the MIT License, unless separately identified as third-party material. |

Generated test captures, reference-analysis previews, caches, dependencies and release distributions are excluded from Git. The runtime assets above are maintained application inputs and remain in source control.

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
