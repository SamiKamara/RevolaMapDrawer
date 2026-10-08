# Distribution and asset provenance

Revola Map Drawer is a specialized offline Windows map editor for **Revola: Post Hyper**. Its fixed dimensions, ship and airlock are specific to that game. It is not a general-purpose drawing application.

## Current review stage

The repository is being prepared as a private repository for its owner's review. No public release or change of repository visibility is part of this preparation. Release automation creates drafts; publishing a draft and making the repository public are separate owner decisions.

No project-wide software license has been selected. Before public distribution, the owner should choose and add the intended software license and document the redistribution terms for the supplied artwork and reference materials. This notice records provenance; it does not grant rights to those materials.

## Project materials

| Material | Provenance and use |
| --- | --- |
| `alustava toteutusohje.txt` | Original Finnish implementation brief, preserved unchanged as a source reference. |
| `RevolaCandiMapASample.png`, `RevolaCandiMapBSample.png` | Original supplied reference maps, preserved unchanged. Used to measure the editor's fixed geometry. Not included in the portable application. |
| `assets/ship.png` | Derived from the supplied Map A reference with the documented crop and bounded symmetric airlock correction. Bundled in the application and included in map exports. See [reference analysis](REFERENCE_ANALYSIS.md) for extraction, coordinates and preservation evidence. |
| `assets/ship-floor-contour.js` | Maintained runtime geometry derived from the bundled ship image for floor generation. |
| `assets/editor-stars.png` | Supplied editor background artwork, bundled for offline use. It is an editor aid and is excluded from map exports. |
| Source code and documentation | Project implementation and maintained documentation. A project-wide license remains an owner decision. |

Generated test captures, reference-analysis previews, caches, dependencies and release distributions are excluded from Git. The runtime assets above are maintained application inputs and remain in source control.

## Third-party runtime notices

The portable Windows application includes Electron and its bundled Chromium, Node.js and other runtime components. Keep the packaged `LICENSE` and `LICENSES.chromium.html` files with the entire application folder. Release builds also include `THIRD-PARTY-NOTICES.txt` identifying the bundled Electron version and these notice files.

The runtime notices apply to their respective third-party components. They do not provide a license for this project's source code, the Revola game, or supplied artwork. Build and test dependencies are pinned in `package-lock.json` and are not shipped as development tools in the portable application.

## Public distribution review

- Review the source, original brief, references and documentation before changing repository visibility.
- Choose the project software license and record artwork/reference redistribution terms.
- Review the draft release's version, changelog, complete portable ZIP and SHA-256 checksums.
- Test the extracted folder on the intended Windows x64 systems. Current automated checks do not establish support for every Windows version or machine.
- Record any code-signing decision. Current builds are unsigned and have no automatic updater.

The release procedure is maintained in [RELEASING.md](RELEASING.md). Current verified checks and limitations are in [CHECKLIST.md](CHECKLIST.md).
