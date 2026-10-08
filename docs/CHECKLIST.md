# Implementation checklist

Update on every verified milestone. `[x]` verified, `[-]` in progress, `[ ]` pending.

## Airlock correction release — version 0.10.4

- [x] Fit the focused airlock UI checks to smaller windows, retain actual preview,
  pointer and persistence assertions, and prepare version 0.10.4.
- [x] Verify the complete local portable build and the compact-window regression.
- [x] Commit/push `main`, create immutable v0.10.4 and verify hosted checks/draft.
- [x] Publish verified v0.10.4 as latest and verify the downloadable assets.
- [x] Inspect and launch the actual desktop shortcut for the final handoff.

The owner's release-update request remains the authorization. The first hosted
attempt exposed a fixed-zoom assumption in the new UI test, after v0.10.3 had
already been tagged. Version 0.10.4 corrects test framing while retaining the
same application geometry. The v0.10.3 tag remains unchanged and unpublished.

### Version 0.10.4 release verification — 2026-10-08

- Preparation commit **53747d086b07f41986e495c388f5d44d13809c99** was pushed
  directly to synchronized `main`. [Verify application run 37775610556](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37775610556)
  passes **243/243** tests, source/packaged UI and the compact wall-start checks.
  The maintained `scripts/create-release.ps1 -Version 0.10.4 -Push` repeated the
  full local build, exact package/ZIP verification and extracted offline save/
  reopen before creating immutable **v0.10.4** at that same commit. Local and
  remote annotated tags peel to it. No existing tag was altered.
- The local tagging build ZIP is **158,199,041 bytes**, SHA-256
  **ac0bf765c87f12d9e834d1df670445efa66a5f2062598186d443ed32e6590252**.
  Its checksum agrees and all **77** ZIP files match the verified package.
  Extracted native persistence preserves the exact **36-wall** graph, with no
  renderer errors or HTTP(S) requests. The prior independent preparation ZIP has
  its own build checksum; cross-build/environment reproducibility is not claimed.
- [Build release run 37778553179](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37778553179)
  passes every step, including the actual draft-creation step. Hosted tests pass
  **243/243** with no skipped tests. Source and packaged checks each pass **11**
  generated floor groups and the focused **10** fixture views, **eight** wall
  placements, **four** facing/legacy compatibility groups and **six** native
  raster crops at the compact **715 × 448** canvas. Optional private floor
  fixture coverage is not configured and is not claimed.
- Downloaded the hosted draft's exact ZIP and checksum into ignored
  `artifacts/release-0.10.4-hosted-assets/`. ZIP: **162,821,121 bytes**, SHA-256
  **9024efcfd3689b01d3ff28e1d011e40aac1720bca48949f25be495abd7b4c85c**,
  agreeing with the checksum, GitHub asset digest and hosted build logs. Its
  **77** files include the complete runtime and notices. Two local text files
  differed only by CRLF/LF; the downloaded `src/render.js` and `src/style.css`
  bytes matched the immutable Git blobs exactly. Normalized the local files to
  those committed LF bytes without changing source content, then the downloaded
  archive's **20** runtime files/minimal manifest matched byte-for-byte. Its
  extracted native offline save/reopen independently passes with **36 walls**,
  exact geometry, no renderer errors and **zero network requests**. The local
  desktop package was refreshed after this line-ending normalization.
- Published [v0.10.4](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.4)
  at **2026-10-08 12:45:47 UTC**, with `draft=false`, `prerelease=false` and
  explicit latest status. The reviewed final notes omit the draft-pending sentence.
  Latest-release metadata identifies **v0.10.4** and the exact two verified assets:
  `RevolaMapDrawer-0.10.4-win-x64.zip` and `SHA256SUMS.txt`. The repository remains
  public, default branch `main`; no visibility change was made. The v0.10.3
  preparation tag remains unpublished and untouched.
- Anonymous release-page and public checksum downloads both return **HTTP 200**;
  the public checksum retains the exact verified hosted ZIP hash above. README,
  changelog and release instructions now identify the published latest release.
  All **31** local relative documentation links still resolve.
- Final `npm run package` and `npm run test:packaged` pass after normalizing the
  local source bytes. All **20** runtime files and the minimal **0.10.4** manifest
  match source, with native persistence, SVG/floor checks and compact wall-start
  checks passing without renderer errors. Fresh `-VerifyOnly` shortcut readback
  confirms direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`,
  empty arguments, repository working directory and existing target/icon paths.
  Launched the actual desktop `.lnk` through Windows Shell; Computer Use verified
  the packaged `resources/app.asar/index.html` editor, **8192 × 8192** canvas,
  corrected upper-corner handles, image export controls and clean **0 walls / 0
  doors** with disabled history. Left it in Wall mode at **52%** airlock zoom.
  No user map was opened or modified. The final documentation-only follow-up
  records publication evidence without moving the release tag or altering runtime
  application files. Generated distributions, downloaded verification artifacts
  and the desktop shortcut remain outside Git.

### Version 0.10.4 viewport preparation — 2026-10-08

- Reproduced the hosted out-of-canvas endpoint assertion in a real **1024 × 700**
  Electron window. The fixed 35% zoom placed the upward endpoint above its
  **715 × 448** canvas. The test now derives bounded real wheel zoom from the
  calibrated viewport and full fixture bounds, with a **24 px** inset. Exact
  pointer/preview/graph/persistence assertions remain unchanged.
- Source checks pass in default **1094 × 708** canvas at **35%** zoom and compact
  **715 × 448** canvas at **25.879%**. The same checks pass against the existing
  0.10.3 package's matching runtime source; the 0.10.4 full build remains pending.
  Each run verifies ten fixture views, eight placements, four compatibility/
  facing groups, six native raster crops and zero renderer errors. Both aggregate
  UI scripts now select `--compact`, so minimum-window coverage runs locally and
  in hosted release verification. Default-size focused checks remain available.
- `npm test`: **243/243 pass** with package/lockfile/changelog at **0.10.4**.
  Dependencies and application geometry are unchanged. Maintained evidence:
  `artifacts/ship-port-compact-results.json` and
  `ship-port-packaged-compact-results.json`.

## Airlock correction release — version 0.10.3

- [x] Select patch version 0.10.3, align both package files and the dated changelog,
  and include the focused source/packaged wall-start checks in the release flow.
- [x] Verify the complete local portable ZIP and extracted offline persistence.
- [x] Commit and push clean `main`, create the immutable v0.10.3 tag through the
  maintained release script, and inspect hosted verification results.
- [ ] Public v0.10.3 publication: superseded by v0.10.4 before draft creation.
- [x] Inspect and launch the rebuilt desktop shortcut during local preparation.

The owner's follow-up explicitly requests committing, pushing and updating the
release. Version **0.10.3** is selected for the accepted airlock wall-start fix;
the published v0.10.2 and its tag remain unchanged. No visibility change is needed.
Local preparation and tagging succeeded; hosted verification failed as recorded
below. This version was not published and is superseded by the 0.10.4 preparation.

### Version 0.10.3 preparation verification — 2026-10-08

- The full maintained `scripts/build-release.ps1 -Version 0.10.3` passes
  installation, **243/243** geometry/persistence/release tests, source UI,
  packaging, packaged UI, byte comparison of all **77** ZIP files and extracted
  offline native save/reopen of the exact **36-wall** graph. Renderer errors and
  HTTP(S) requests during extracted persistence are both **zero**. Both aggregate
  UI scripts now run the eight focused wall-start placements and four facing/
  legacy compatibility groups. The optional private floor fixture was not configured.
- Local ZIP: **158,199,042 bytes**, SHA-256
  **82c69ec3f18637267205b8e2ae03ea1ad4305891a99e6daf759337f570023312**.
  The adjacent `SHA256SUMS.txt` agrees. All **20** runtime files and the minimal
  manifest match source; the ASAR has **24 entries**. Generated output remains
  under ignored `artifacts/release/v0.10.3/`.
- The first preparation run exposed a version literal in the real-root Windows
  ZIP regression. It now reads the selected package version, retaining the
  tampered/missing-file checks; isolated unit fixtures are unchanged. The focused
  release suite passes **10/10** and the full build above passes after this repair.
- `postpackage` refreshed the real desktop shortcut. Fresh `-VerifyOnly` readback
  confirmed the direct packaged executable target, empty arguments, repository
  working directory and existing executable/directory/icon paths. Launched the
  actual `.lnk` through Windows Shell; Computer Use verified its bundled
  `resources/app.asar/index.html` editor, **8192 × 8192** canvas, upper-corner
  handles, all image export controls and clean **0 walls / 0 doors**. Closed only
  this clean agent-owned test instance normally before the tagging rebuild.
- All **31** local relative Markdown links resolve. No user map, original source
  PNG, brief or bundled ship raster was changed. Commit/tag, hosted build and
  public publication evidence will be recorded after those operations succeed.
- Implementation commit **cdffa726d177cebb5d2e75336ded3db2f53ad9de** was pushed
  directly to synchronized `main`. The maintained create-release script repeated
  all local checks successfully and created/pushed immutable **v0.10.3** at that
  exact commit. [Verify application run 37774736330](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37774736330)
  and [Build release run 37774944092](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37774944092)
  fail in the focused UI test: its fixed zoom places an upward endpoint outside
  the smaller hosted canvas. Geometry and prior UI suites pass; no draft is
  created and no release is published. The correction is prepared as v0.10.4
  without moving, deleting or recreating v0.10.3.

## Airlock wall-start correction — 2026-10-08

- [x] Move new wall handles to measured upper corners in both ship facings.
- [x] Preserve legacy saved attachments and pin both generations across editing,
  doorway spans, paste and closed-map floor analysis.
- [x] Verify geometry/persistence and actual wall drawing, rebuild the package,
  and inspect/launch the actual desktop shortcut.

Scope: local unreleased correction on the **0.10.2** baseline. New handles are
**(3739.5,4700)** and **(4481.5,4700)**; old saved vertices remain exact. The ship
artwork, source references, doorway/corridor dimensions, world center/scale and
document schema stay unchanged. Verified evidence is recorded below.

### Airlock wall-start verification — 2026-10-08

- `npm test`: **243/243 pass**, including **eight** new regressions for measured
  corners, pinning, doorway-span boundaries, paste, exact JSON/editable PNG
  persistence, old/new closed stations, exterior erasures and centered expansion.
  Sixteen near-attachment construction combinations keep exact fixed starts,
  endpoints and existing graph IDs; insertion cannot shift a resolved preview
  onto a nearby old pin.
- `npm run test:ui` and `npm run test:packaged` pass construction/history, native
  project/PNG round trips, SVG fidelity, automatic floors and the compact window,
  without renderer errors. The optional private floor fixture was not configured;
  the generated interaction groups are the scope of this run.
- `node scripts/ship-port-smoke.mjs` (also exposed as
  `npm run test:ship-ports`) and
  `node scripts/ship-port-smoke.mjs --packaged` pass **eight** real mouse wall
  placements per run: upward and outward horizontal walls from both corners,
  in both facings. Actual dashed previews agree with committed coordinates.
  Both facing-toggle groups and both legacy/new compatibility groups preserve
  exact graph, one-step history and native save/reopen. Six independent native
  crops per run contain **484/484 opaque white joint samples**, no nonwhite wall
  pixels and exact **375 px** outer/inner openings. Source and packaged editor
  crops were visually inspected. Evidence: `artifacts/ship-port-results.json`,
  `ship-port-packaged-results.json` and `ship-port-*-drawn-native.png`.
- `npm run package` rebuilds the **0.10.2** executable. All **20** runtime
  source/asset files and the minimal manifest match current source; the ASAR has
  **24 entries**. The focused packaged test additionally compares its six relevant
  drawing/runtime files byte-for-byte. The final rebuild after adding the named
  test command retains these same verified runtime bytes.
- `postpackage` refreshed the actual desktop shortcut. A fresh
  `scripts/update-desktop-shortcut.ps1 -VerifyOnly` readback confirms the direct
  `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe` target,
  empty arguments, repository working directory and existing target/directory/icon
  paths. Launched that exact `<desktop>\RevolaMapDrawer - testattava versio.lnk`
  through Windows Shell. Computer Use verified its process-backed English editor,
  bundled `resources/app.asar/index.html`, **8192 × 8192** canvas and corrected
  handles on both upper corners. Left its clean **Untitled map**, **0 walls / 0
  doors**, disabled history, in Wall mode at **52%** zoom around the airlock.
- Limits: existing walls are never automatically repositioned, including old
  attachments with the previous offset; only new wall-start handles are corrected.
  Legacy saved pins remain usable when present in the graph. Ship raster SHA-256
  remains **30bcac47e18eb0f517ba2731e9cb11e4263a3c1bf8fad27e00b98c2c4bc0b804**;
  the original brief and source PNGs are unchanged. No user map was opened or
  modified. This fix is local and unreleased; no commit, tag, push or publication
  was requested or performed. Generated evidence, builds and the shortcut remain
  outside Git.

## Public release and MIT license — 2026-10-08

- [x] Owner reviewed the private project and explicitly authorized the GitHub release and public repository.
- [x] Apply the standard MIT license with the original copyright and permission notices preserved, update distribution documentation, and include the project license separately from Electron's licenses in the portable package.
- [x] Verify the rebuilt version **0.10.2** locally, create its immutable release tag from synchronized `main`, and verify the tag-triggered GitHub build and draft assets.
- [x] Publish the verified release as latest, change repository visibility to public, and verify public access and downloadable assets.
- [x] Inspect and launch the latest packaged executable through the real desktop shortcut and record final release evidence.

The owner's publication request and later permissive-license request are the authorization for this milestone. Software and map geometry remain at version **0.10.2**. The original brief and source PNGs remain unchanged. No user map is modified: the existing test window contained a clean Untitled map with **0 walls / 0 doors**, disabled undo/redo and no unsaved indicator before normal close for rebuilding.

### Public release verification — 2026-10-08

- Standard MIT terms are in root `LICENSE`, copyright **2026 SamiKamara**; package metadata, lockfile and the minimal runtime manifest identify **MIT**. The portable package includes an exact copy as `LICENSE-RevolaMapDrawer.txt`, retaining Electron's separate `LICENSE`, Chromium notices and third-party notices. The README explains preserving software copyright/license notices and that exported maps do not require an added editor credit. GitHub recognizes the MIT license. All **31 relative links across eight Markdown documents** resolve; no missing targets.
- The complete local `scripts/create-release.ps1 -Version 0.10.2 -Push` run passes installation, **235/235** tests, source UI, packaging, packaged UI, all **77** ZIP file byte comparisons and extracted offline native save/reopen of the exact **36-wall** graph. Source and packaged floor checks cover **11 generated interaction groups**; the optional private complex fixture was not configured for this release. No renderer errors or HTTP(S) requests occur during the extracted portable persistence check. The ASAR contains **20 runtime source/asset files**, a minimal manifest and three directories (**24 entries**), matching the tagged source. Local ZIP: **158,198,424 bytes**, SHA-256 **`1da431282ad9c5a48b273add38e02e1ed4afc76c1e89f617b84ba760cbb7a6c1`**.
- Clean local `main` and refreshed `origin/main` agreed on **`d19ed5e69e66fde4640d1c338a2448361b6745cf`** before the annotated immutable **`v0.10.2`** tag was created and pushed. The local and remote tags peel to that exact commit. This checklist's subsequent verification-only commit does not move the release tag or alter bundled application files.
- Hosted Windows 2025 / Node.js 24 [Verify application run 37765171586](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37765171586) and tag-triggered [Build release run 37765334766](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37765334766) both pass. The release build verifies **235/235** tests, source/packaged UI, all **77** portable ZIP files, extracted offline native persistence, artifact upload and the actual **Create or update draft only** step. The uploaded ZIP digest agrees with the build log and draft checksum file before publication.
- [SamiKamara/RevolaMapDrawer](https://github.com/SamiKamara/RevolaMapDrawer) is **PUBLIC**, default branch `main`. [v0.10.2](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.2) is the stable **latest** release, `draft=false`, `prerelease=false`, published **2026-10-08 10:47:49 UTC**. Final notes remove the draft-pending-review sentence. The two assets are `RevolaMapDrawer-0.10.2-win-x64.zip` and `SHA256SUMS.txt`. Anonymous repository/release pages and checksum access return **HTTP 200**.
- Downloaded both published assets without authentication into ignored `artifacts/public-release-verification/`. The ZIP is **162,820,507 bytes**, SHA-256 **`a7251b6ec420136b725c75775d96bac6d68a38ed394cbf649dd881cafb6e6f9c`**, matching the public checksum, GitHub asset digest and hosted build log. Independently opened the downloaded archive, counted **77 files**, verified the executable/runtime and notice files exist, and compared its project license byte-for-byte against root `LICENSE`. Local and hosted ZIP hashes identify their individual builds; cross-environment byte reproducibility is not claimed.
- `postpackage` refreshed the real `<desktop>\RevolaMapDrawer - testattava versio.lnk`. A fresh `-VerifyOnly` readback confirms direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory, executable icon and existing referenced paths. Launched that actual shortcut using Windows Shell (`Invoke-Item`). Computer Use selected the returned window from this exact executable and verified the visible English editor, bundled `resources/app.asar/index.html` location, **8192 × 8192** canvas, fixed ship and all four image-export buttons. Its clean **Untitled map**, **0 walls / 0 doors**, remains open in Wall mode. No user map was changed. The `.lnk`, distributions and verification evidence remain outside Git.
- Original brief SHA-256 remains **`0bd6c8333fd8c148d5323aa355ad399323ba50ca7b0ddea65080e2f41844a3de`**; source PNG A remains **`eca719f381e13f2dc36c7b9f164410a28e211fa6487fa20d1e2d14b0eb397a93`**; source PNG B remains **`8a56807d424eed530d2608e8fdd31d3f0b6c0d37563e4803a6e62b19e15239cc`**. Supported distribution remains Windows x64 and the executable remains unsigned. Other platform packages, signing and the optional private complex fixture are not claimed by this release.

## Private distribution preparation — 2026-10-08

- [x] Refresh the English README and documentation around the specialized **Revola: Post Hyper** map workflow and portable Windows distribution.
- [x] Prepare and locally verify an agent-operated release pipeline based on ModularGameOverlay, with version/changelog/tag checks and draft releases.
- [x] Verify geometry, UI, packaged application, complete portable archive and the actual desktop shortcut.
- [x] Create and push `SamiKamara/RevolaMapDrawer` on `main` as a private GitHub repository for owner review.
- [x] Verify the hosted main CI and the manual release build without creating a tag or release.
- [x] Owner review before public visibility or release publication; approved in the subsequent publication request.
- [x] Owner selected a common permissive attribution license; the standard MIT license is applied in the subsequent public-release milestone.

Scope: keep application version **0.10.2**, existing geometry and document schema unchanged. This milestone prepares the release process; it does not create a release tag, publish a release or make the repository public. Source references remain unchanged. Historical machine paths below use `<repository root>` and `<desktop>` placeholders; private user maps and backups stay outside Git.

### Distribution verification — 2026-10-08

- The complete `scripts/build-release.ps1 -Version 0.10.2` run passes `npm ci`, **235/235** tests (225 existing geometry/persistence tests and ten release regressions), source UI, packaging, packaged UI, ZIP byte verification and extracted portable startup/persistence. Release regressions cover version/changelog/tag mismatch, clean synchronized source, existing-tag source identity, runtime exclusions, stale ASAR data, output containment, checksum tampering and missing/changed ZIP files.
- Source and packaged UI checks cover construction, movement/history, native PNG/project round trips, SVG fidelity at 8192/16384 and **11 generated floor interaction groups** without renderer errors. The optional private complex floor fixture is now explicitly selected with `REVOLA_FLOOR_FIXTURE`; it was **not configured** in this milestone or CI and is not claimed as part of this run. Prior fixture verification remains in its original dated notes below.
- The runtime archive contains **20 source/asset files** plus the minimal manifest and three directories (**24 entries**). All runtime files match the current local source byte-for-byte. It excludes Git/agent metadata, development dependencies, original references and generated evidence. The portable folder retains Electron's license files plus concise standalone instructions, canonical documentation links and third-party notices.
- The complete ZIP contains **76 files**, each hashed against the verified package. Local ZIP: `artifacts/release/v0.10.2/RevolaMapDrawer-0.10.2-win-x64.zip`, **158,196,991 bytes**, SHA-256 **`1ffc9d4f8e1b7bafd810c34808c18411f5ad8747c26967b14b7b8cf0b53c40a1`**. The adjacent `SHA256SUMS.txt` matches. Extracted startup uses that folder as the working directory, loads its bundled `resources/app.asar/index.html`, and saves/reopens an exact **36-wall** project with no renderer errors or HTTP(S) requests during the persistence check. Evidence: `artifacts/portable-results.json`, `portable-editor.png`, `packaged-results.json`, `svg-packaged-results.json` and `floor-packaged-results.json`.
- `postpackage` refreshed the actual `<desktop>\RevolaMapDrawer - testattava versio.lnk`. The `-VerifyOnly` readback confirms direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory, executable icon and existing referenced paths. Launched that exact shortcut with Windows Shell (`Invoke-Item`). Computer Use selected the returned process-backed window from that executable and confirmed the visible English editor, **8192 × 8192** canvas, fixed ship, all four image-save buttons and **0 walls / 0 doors**. The clean Untitled map remains open in Wall mode. No user map or backup was modified.
- Generated distributions, dependencies, test evidence, reference previews, Python caches and desktop shortcuts are ignored by source control. Original brief and both PNG SHA-256 values remain unchanged; their Git attributes also disable text conversion. Historical machine paths are generalized without removing verification history. All **24 relative documentation links** resolve. [DISTRIBUTION.md](DISTRIBUTION.md) records runtime notices, asset provenance and the remaining public-distribution decisions.
- Source was committed and pushed directly to `main` in [SamiKamara/RevolaMapDrawer](https://github.com/SamiKamara/RevolaMapDrawer), verified as **PRIVATE** with `main` as the default branch. Implementation commit: **`5ea6f6016b7d4ba8fc5f9b9881515a1a19358a00`**. Local `main` and `origin/main` matched; the real release preflight (`--new-tag --verify-package --verify-assets`) passed without creating a tag. Git blob bytes also exactly match all three unchanged original source files.
- Hosted Windows 2025 / Node.js 24 [Verify application run 37762117176](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37762117176) passes installation, **235/235** tests, source UI, packaging and packaged UI. [Build release run 37762131276](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/37762131276) passes the complete build, all **76** ZIP file comparisons, extracted offline native save/reopen and artifact upload. Its **Create or update draft only** step is correctly skipped for the default manual build. The private Actions artifact contains the portable ZIP, `SHA256SUMS.txt` and generated notes and is retained for **14 days**.
- Downloaded the private Actions artifact into ignored `artifacts/github-release-verification/` and independently verified its **162,819,086-byte** ZIP against both the accompanying checksum and hosted build log: SHA-256 **`6880234569032b54c1db37292ad83591d7c7889ced8c5f6f92cfc3c64d97db41`**. Checksums belong to their exact individual builds; local and hosted archives are not claimed to be byte-reproducible across build environments. At the end of this private-preparation milestone, no version tag or GitHub Release had been created; actual tag-triggered draft creation and public publication were verified in the subsequent public-release milestone above.

## Door-centered ship facing — version 0.10.2
- [x] Mirror around the actual outer door center and keep drawn corridors, fixed graph ports and shared render/floor/export coordinates aligned.
- [x] Verify geometry/persistence, corridor-then-toggle interactions, history/reopen and image output in both orientations.
- [x] Rebuild and verify the Windows package, then inspect and launch the actual desktop shortcut.

Scope: keep normal artwork placement and document schema version 2. Mirrored artwork gains a 29 px correction, making both outer/inner doorway centers x4110.5. Older saved corridors at the former mirrored x4081.5 retain their exact geometry; there is no automatic relocation of existing user walls. Original reference PNGs and the bundled ship raster remain unchanged.

### Version 0.10.2 verification — 2026-10-08

- `npm test`: **225/225 pass**; the focused renderer, SVG, ship asset/corridor and floor suites pass **50/50**. New regressions cover corridor-first facing changes both ways, exact graph/pin/bounds/project persistence, independently measured Canvas/SVG door centers, floor footprint reflection and station closure at the unchanged graph ports. The shared artwork transform fixes the legacy anchor's 14.5 px horizontal offset without changing the saved anchor or raster.
- `npm run test:airlock` and `node scripts/airlock-smoke.mjs --packaged` each pass **six real Electron interaction groups**, including both corridor-then-flip directions. Existing rails stay x3820.5/x4400.5, exactly **580 px** apart and centered at **(4110.5,4700)**. Mirror/corridor history remains separate and exact; native save/reopen retains the same geometry. Each run independently scans **eight 841 × 685** raster crops: zero symmetry differences/nonwhite pixels and unchanged **375 px** door cuts at y4700/y5308. Source and packaged flipped-editor screenshots were inspected. Evidence: `artifacts/airlock-results.json`, `airlock-packaged-results.json` and `airlock-*-flipped-editor.png`.
- `npm run test:ui` passes construction, movement/history, native editable PNG/project round trips, SVG regressions and all **12 automatic floor interaction groups**, without renderer errors. Both floor formats match the corrected mirrored hull; SVG coverage includes all **522,771** independently rendered ship wall pixels and PNG covers **1,616** native samples. Internal doors, courtyard holes, exterior cuts, centered 16384 bounds and rapid mirror/undo remain verified.
- `npm run test:raster` passes at **8192** and centered **16384**, with exact editable metadata, white visible pixels, transparent background and pixel-exact whole ship in both orientations against independent measured mirror transforms. Existing wall silhouette alpha budgets and bounded stripe memory remain unchanged. Bundled ship SHA-256 remains **30bcac47e18eb0f517ba2731e9cb11e4263a3c1bf8fad27e00b98c2c4bc0b804**; no source PNG or user map was edited.
- `npm run package` and the sequential `npm run test:packaged` pass for **0.10.2**. All **20** bundled HTML, source JavaScript/CSS, Electron and asset files match current source byte-for-byte. Native persistence, compact layout, SVG raster fidelity and all **12 automatic floor interaction groups** pass in the rebuilt executable, followed by the focused packaged airlock check. Evidence: `artifacts/packaged-results.json`, `svg-packaged-results.json`, `floor-packaged-results.json` and `export-raster-results.json`.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` inspected its direct target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory and existing executable/directory/icon paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** using Windows Shell (`Invoke-Item`). Computer Use verified the visible canvas, ship, facing control and packaged **resources/app.asar/index.html** accessibility location. Left its clean **Untitled map**, **0 walls / 0 doors**, open in Corridor mode. The shortcut remains machine-only outside the repository.

## Automatic floors and unified image exports — version 0.10.1
- [x] Automatically display floors whenever closure enables stars, including New/Open and geometry/history changes.
- [x] Remove the entire Floors inspector panel and place four consistently named PNG/SVG save buttons in the header.
- [x] Verify geometry/persistence, automatic floor coverage, native export behavior and compact header layout.
- [x] Rebuild and verify the package, then inspect and launch the actual desktop shortcut.

Scope and limits: closure, floor geometry, 12 px rim, courtyard holes, transparent exports and persistence contracts remain unchanged. Floor coverage is always displayed for a successfully checked closed map, with no manual generation or preview setting. Open/pending/unsupported maps keep floor save actions disabled. Wall PNG still carries editable data and Ctrl+S; floor image exports and wall SVG preserve unsaved project state. The source references and user's maps remain unchanged.

### Version 0.10.1 verification — 2026-10-08

- `npm test`: **221/221 pass**. Pure geometry, floor generation, PNG encoding and editable persistence contracts retain their existing checks. No source reference, ship asset or user project is changed.
- `npm run test:ui` passes existing drawing/history/native persistence and SVG regressions plus **12 automatic floor interaction groups**. Opening a closed map enables both floor saves and renders floor/stars without a click; New and exterior openings remove them. Internal doorway changes, courtyard restoration, undo/redo, mirror and texture-seed-only reopening update automatically. Independent canvas pixel comparisons match the supplied repeating stars outside and require opaque black floor in reachable rooms. Rendering leaves dirty state/history untouched.
- A synchronous mirror-then-undo regression verifies that returning to cached geometry cancels pending analysis rather than assigning a stale geometry key. Both floor saves stay ready, floor/stars stay visible, and SVG, dirty and history controls remain exact. Native save cancellation, atomic write failure, dirty-close protection and transparent PNG/SVG coverage retain their checks. The supplied 16384 map still exports **786,754-byte PNG / 467,853-byte SVG** with **four transparent courtyard holes**, leaving its original bytes unchanged.
- The complete Floors inspector section, closure information, Generate floor and Show black floor controls are absent. **Save wall PNG**, **Save wall SVG**, **Save floor PNG** and **Save floor SVG** share one header row and base button geometry; PNG buttons share green styling and SVG buttons muted blue styling. Actual **1024 × 700** window checks verify all labels are unclipped and in bounds, with matching format-pair styling. Visually reviewed `artifacts/floor-compact.png` and `floor-complex-editor.png`; source evidence is `artifacts/floor-results.json` and `svg-results.json`.
- `npm run package` and the final sequential `npm run test:packaged` pass for **0.10.1**. All **20** checked bundled HTML, source JavaScript/CSS, Electron and asset files match source byte-for-byte. Native persistence, SVG regressions and all **12 automatic floor interaction groups**, including rapid mirror/undo and the supplied 16384 fixture, pass without renderer errors. Packaged floor exports preserve the same measured bytes, transparency probes and exact ship coverage. Evidence: `artifacts/packaged-results.json`, `svg-packaged-results.json` and `floor-packaged-results.json`.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` read back target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory and existing target/directory/icon paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** with Windows Shell (`Invoke-Item`). Computer Use verified the visible new header and packaged **resources/app.asar/index.html** location, then opened the supplied complex project through its native file dialog. Its black floor and stars appeared automatically and enabled both floor saves. Left its clean **Untitled map**, **80 walls / 11 doors**, **16384 × 16384**, open with grid hidden and all four image save actions visible. No user project or backup was modified; the shortcut stays outside the repository.

## Closed-map floors — version 0.10
- [x] Verify closure from the ship through traversable internal doors, rejecting exterior doors and erased gaps.
- [x] Generate a solid black floor with a 12 px outer rim and separate transparent PNG/SVG exports; preserve sealed courtyard voids.
- [x] Repeat the supplied star texture in the editor for closed maps; keep exports free of stars and overlays.
- [x] Complete geometry, persistence, native UI and reference-fixture checks.
- [x] Rebuild and verify the package, then inspect and launch the actual desktop shortcut.

Reference finding: the supplied MainStation floor is pure black with alpha; native wall/floor scans measure about **10 px** beyond axis-aligned white wall edges and about **8.5–10.6 px** perpendicular to diagonal edges. The new default is **12 map pixels**. The user's complex test map has **80 walls, 70 vertices, 11 doors**, a **16384 × 16384** canvas and origin **(-4096,-4096)**. All input files remain read-only. Closure uses traversable door/gap cuts and fixed ship geometry; generation/export are derived state, without editable floor metadata or schema changes.

Scope and limits: only the face reachable from the ship receives interior floor. Signed boundary cycles preserve sealed courtyards, including disconnected/nested/tilted loops; opening an internal door makes its adjoining interior reachable. A second uncut arrangement rejects any outer-envelope doorway or erasure, including ones hidden behind an unreachable compartment. The fixed ship floor outline covers all visible alpha pixels and its enclosed interior; fixed hull closure tracing has **≤1 px** deviation. Graph topology retains exact visible intervals with a **1e-9 map-unit** joining tolerance. Intersection, hole-owner and opening analyses each stop at **2,000,000** checks and show **UNAVAILABLE** when unsupported. The rim is consistent rather than a pixel copy of the handmade reference. Floor preview is session state; New/Open require Generate floor again. Floor image exports contain no editable metadata, never clear project dirty state, and preserve the existing v2 document and wall exports.

### Version 0.10 verification — 2026-10-08

- `npm test`: **221/221 pass**, including **14 floor geometry regressions** and **four added PNG encoder regressions**. Exterior doors and valid **0.00385–0.0077 px** erased slits remain open; internal doors, shielded exterior openings, exact ship ports, mirroring and centered expansion pass. Connected bridge-first and disconnected courtyard boundaries, tilted holes, three nested cycles with the ship inside/outside, and Canvas/SVG winding pass without document mutation.
- `npm run test:ui` passes existing drawing/history/native persistence and SVG regressions plus **10 floor interaction groups**. Native floor generation, actual exterior/internal doorway cuts, undo/redo, mirrored ship, texture-seed-only project reopening, preview toggle, save cancellation, atomic write failure, dirty-close protection and **1024 × 700** layout pass with no renderer errors. Generation/export leave graph and history exact. Updated seed reopening produces the independently expected SVG rather than stale outlines.
- Actual floor PNG/SVG exports independently verify solid reachable rooms/doors/wall footprints and rim, transparent exterior and courtyard centers, pure black visible pixels and omitted editor content/metadata. Every SVG covers all **522,771** independently rendered original ship wall pixels opaquely, with zero nonblack pixels; each PNG covers **1,616** native ship wall samples in the correct orientation. Normal/mirrored 8192 floor PNGs are **217,262 / 217,349 bytes**; SVGs **188,851 bytes** each. The supplied 16384 map exports **786,754-byte PNG / 467,853-byte SVG**, preserves its **four courtyard holes**, and leaves the user's original project byte-identical. Evidence: `artifacts/floor-results.json`, `floor-complex-user-map.png`, `.svg`, `floor-complex-editor.png`, courtyard/open/compact screenshots. Native screenshots and generated floor shape were visually reviewed.
- `npm run test:raster` passes existing white wall PNG output at **8192** and centered **16384**, exact editable metadata and unchanged normal/mirrored ship pixels. No fully solid interior or stable background differences; existing silhouette alpha differences stay within the established maximum **8/255**. Stripe canvas remains at most **16384 × 256** (**16 MiB**), readback at most **12 MiB**, avoiding a full-map RGBA allocation.
- Fixed ship footprint extraction is reproducible with `scripts/extract-ship-floor.py`: the filled outline area equals **2,751,208 native pixels**, covers every visible alpha pixel, and reruns byte-identically. Bundled ship hash remains **30bcac47e18eb0f517ba2731e9cb11e4263a3c1bf8fad27e00b98c2c4bc0b804**. Original brief, reference PNGs and user's inputs are unchanged.
- `npm run package` and the final sequential `npm run test:packaged` pass for **0.10.0**. All **20** checked bundled HTML, source JavaScript/CSS, Electron and asset files match source byte-for-byte, including floor geometry, fixed ship contours and editor stars. Native persistence, SVG regressions and all **10 floor interaction groups** pass in the packaged executable with no renderer errors. Packaged floor exports independently retain the same black pixels, transparent courtyard probes, exact ship coverage and dimensions as the source run. Evidence: `artifacts/packaged-results.json`, `svg-packaged-results.json` and `floor-packaged-results.json`.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` read back target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory and existing target/directory/icon paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** with Windows Shell (`Invoke-Item`). Computer Use verified the visible working editor and packaged **resources/app.asar/index.html** location, then opened the supplied complex project through the native file dialog and generated its floor. Left its clean **Untitled map**, **80 walls / 11 doors**, **16384 × 16384**, open with **CLOSED**, black floor enabled, repeating stars, four courtyard voids, both floor export buttons enabled and grid hidden. No user project or backup was modified; the shortcut stays outside the repository.

## Symmetric airlock and fixed outer-door alignment — version 0.9.1
- [x] Mirror the left airlock onto its right side, preserving both exact 375 px openings, the ship anchor, hull and existing pinned graph ports.
- [x] Recognize the outer fixed doorway as a corridor target, with exact normal/mirrored centers and nearest-wall precedence.
- [x] Verify geometry, source UI, transparent exports, rebuilt package and the actual desktop shortcut.

Scope and limits: the original references remain unchanged. The fixed ship remains protected artwork; doorway targeting does not add editable graph walls or doors. Only the outer doorway supplies a target; the lower doorway leads into the protected ship interior. Existing graph ports stay at their original coordinates, while the widened raster upright still overlaps a nominal 50 px attached wall. Existing projects keep their exact graph and receive the corrected bundled artwork when reopened. Automatic endpoint fitting retains its established direction, turn and validation limits.

### Version 0.9.1 verification — 2026-10-08

- `npm test`: **203/203 pass**, including four independent bundled-PNG asset checks and six new fixed-door corridor checks. The complete **841 × 685 px** airlock correction is exactly symmetric, including alpha. Both nominal door centers retain their original positions; both cuts are exactly **375 px**, with occasional one-pixel source lips removed. The right upright moves outward about **21–30 px**. The **2459 × 1931** asset is **148,236 bytes**. Pixels outside source **[3670,4670,4511,5355)**, including the entire hull below y5355, remain byte-identical. Extraction rerun reproduces the bundle. Both source PNG hashes are unchanged. Pin coordinates are unchanged; 50 px attached walls overlap the uprights by **50 px / 23.5 px**, swapped when mirrored.
- `node scripts/airlock-smoke.mjs` and its **--packaged** run pass all **four real interaction groups**: normal/mirrored departures and arrivals. DOOR hover resolves the exact outer centers **(4110.5,4700)** and **(4081.5,4700)**. Live preview saves the unchanged document; Escape leaves it clean with no history. Committed rails retain the fractional center and exact **580 px** separation. One-step undo/redo and native project reopening are exact. Each normal/mirrored native raster comparison checks **576,085 pixels** with **zero symmetry differences** and both 375 px doors; visible pixels are pure white. Evidence: `artifacts/airlock-results.json`, `airlock-packaged-results.json`, normal/mirrored airlock crops and hover/arrival-preview screenshots. Native airlock/detail previews were visually reviewed.
- `npm run test:ui` passes drawing, rooms/corridors, doors, movement/history, dialogs, native PNG/project round trips, compact layout and SVG exports without renderer errors. The **437,941-byte** editable PNG has **1,634,321 white visible pixels** and exact document metadata. `npm run test:corridor-end` passes all **12 existing endpoint interaction groups**, protecting fractional graph targets, doors/erasures, nearest-wall semantics, parallel/off-ray fallbacks and cancellation.
- `npm run test:raster` passes at **8192** and centered **16384**, preserving white visible pixels, transparent background and exact metadata. The corrected whole ship matches independently rendered PNG pixels exactly in both orientations, including export stripe boundaries. Expanded export is **767,193 bytes**; existing bounded wall-silhouette alpha differences remain unchanged, with zero solid-interior/background differences and maximum **8/255**. SVG source/packaged exports also retain the corrected bundled ship pixel-for-pixel, with zero stable opaque/clear differences over **9.45–9.59 million pixels** per export.
- `npm run package` and the final sequential `npm run test:packaged` pass for **0.9.1**. All **17** checked bundled HTML, JavaScript/CSS, Electron and ship files match source byte-for-byte, including `src/ship.js`. Native save/open, SVG save/cancellation/write-failure/dirty behavior and **1024 × 700** layout pass with no renderer errors. The dedicated packaged airlock regression verifies the new interaction and asset files against source. Evidence: `artifacts/packaged-results.json`, `svg-packaged-results.json` and `airlock-packaged-results.json`.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` read back target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory and existing target/directory/icon paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** with Windows Shell (`Invoke-Item`). Computer Use verified its visible working canvas, corrected ship and packaged **resources/app.asar/index.html** location; selecting Corridor displays the new outer-airlock-door guide. Left its clean **Untitled map**, **0 walls / 0 doors**, open in Corridor mode. No existing user map or backup was modified; original brief/source PNGs remain unchanged. Shortcut stays outside the repository.

## Compact SVG export — version 0.9
- [x] Add native and browser **Save SVG**, with transparent self-contained white map content.
- [x] Simplify shared wall outlines while preserving exact door/eraser cuts, miters and expanded world bounds.
- [x] Verify meaningful geometry/size checks, real export/save failure/cancel/dirty behavior and raster fidelity.
- [x] Rebuild and verify the Windows package; inspect and launch the actual desktop test shortcut.

Scope and limits: SVG exports wall vectors and embeds the original fixed ship PNG once. It omits editable document metadata and cannot be reopened as a Revola project; SVG export keeps unsaved project changes dirty. Save PNG or project for editable persistence. Outline simplification is bounded to 0.25 map pixels including coordinate rounding; cap endpoints and miter polygons retain exact geometry. The unchanged 148,970-byte ship adds roughly 199 KB in base64, rather than thousands of traced nodes. Native SVG files are bounded to 32 MiB. Small differences in silhouette alpha are expected from simplification and SVG rasterization; this is not a pixel-exact replacement for PNG wall exports.

### Version 0.9 verification — 2026-10-08

- `npm test`: **193/193 pass**, including **nine SVG regressions**. Zero-roughness walls use exactly four corners, independently of length, direction and graph subdivision. Rough reversed/subdivided walls serialize identically. Both directions of silhouette-distance comparison stay under **0.25 map pixels**, including interior coordinate rounding. Exact axis/diagonal **375 px** door cuts, genuine erased gaps below **0.0005 px**, miter joins and erased-corner suppression pass. Expanded bounds, escaping, input guards, original ship bytes, anchor/mirroring, determinism and document non-mutation pass.
- `npm run test:ui` passes existing construction, rooms/corridors, doors, constrained movement, undo/redo, zoom/pan, native PNG/project persistence and **1024 × 700** layout, then the new real SVG export checks. The PNG remains **437,931 bytes** with **1,631,246 white visible pixels**, exact editable metadata and no renderer errors. Native SVG export, cancellation and an actual atomic replacement failure against a directory preserve geometry, history controls and dirty state; all save controls recover. SVG success retains native dirty-close protection, while project/PNG saves still clear dirty state.
- The SVG fixture exports **208,201 bytes** at **8192 × 8192**, removing **624 of 1,204 wall points** (**580 retained**); its geometry/XML overhead beyond the ship base64 is **9,573 bytes**. Mirrored export is **208,213 bytes**. Centered **16384 × 16384** export with an added negative-coordinate wall is **209,639 bytes**, retaining **677 of 1,430 points**. The fuller Airlock sector example is **223,463 bytes**, with a **24,549-byte wall path** and **1,331 of 2,674 wall points** retained. Canvas expansion changes the viewBox, without moving/scaling pre-existing vector coordinates.
- Parsed actual SVG files contain one white nonzero-fill path and one embedded original PNG, without background, grid, handles, source graph metadata or external references. Finite native-resolution SVG crops test axis/diagonal doors, erasures, solid walls, sharp miters, a shared T junction, empty background, ship/airlock and negative world geometry. Each export compares **9.45–9.59 million stable opaque/clear pixels**, with **zero differences** and **zero nonwhite visible pixels**. The separately isolated actual SVG ship image matches the original renderer **pixel-for-pixel**, in both orientations. An initial exact composite check found **12 wall-edge pixels** in the airlock crop: those belong to editable walls beside the pinned ports and are intentionally simplified. The corrected check keeps strict unchanged-ship raster equality and stable composite interiors/cuts; differences are confined to silhouettes (maximum sampled alpha difference **93/255**).
- Browser preview, without the desktop bridge, loads the original PNG through local fetch/FileReader and downloads SVG with the correct format. The mirrored browser download is **byte-identical** to the native file, keeps changes dirty and opens independently from disk without editor/assets/server. No renderer errors. Evidence: `artifacts/svg-results.json`, `svg-normal.svg`, `svg-mirrored.svg`, `svg-expanded.svg`, `svg-browser.svg`, `svg-editor.png`, `svg-compact.png`, and `svg-browser-editor.png`.
- `npm run package` and `npm run test:packaged` pass for **0.9.0**. All **16** bundled HTML, source JavaScript/CSS, Electron and ship files match current source byte-for-byte, including `src/svg.js` and the dedicated bundled-ship bridge. Native project save/open and compact layout pass, followed by all three SVG exports and the same cancellation/write-failure/dirty/PNG/raster checks in the rebuilt executable, with identical point counts/file sizes and no renderer errors. Evidence: `artifacts/packaged-results.json` and `svg-packaged-results.json`; packaged/source screenshots were visually reviewed.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory, executable icon and existing paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** through Windows Shell (`Invoke-Item`); Computer Use verified the visible working canvas/ship and new **Save SVG** control at packaged **resources/app.asar/index.html**.
- The previous packaged window contained an unsaved **31-wall / 0-door** map. Saved it through the actual native project dialog to a new **5,443-byte** desktop backup **<desktop>\RevolaMapDrawer - ennen SVG-paivitysta 2026-10-08.revola.json**, validated its graph, then closed the clean old window for rebuilding. Reopened that exact backup through native Open in the shortcut-launched new build and left its clean **31-wall / 0-door** map visible with **Save SVG** ready. Original brief/source PNGs and existing user map files were not changed. The shortcut and desktop backup remain outside the repository.

## Automatic corridor endpoint alignment — version 0.8
- [x] Reuse start targets at the raw endpoint and fit the whole route with exact endpoints and minimum bend displacement.
- [x] Show fitted endpoint preview and commit automatically, preserving cancellation and one-step history.
- [x] Verify geometry/persistence, actual endpoint interactions and existing UI regressions.
- [x] Rebuild the Windows package, verify source parity and endpoint behavior, inspect and launch the actual desktop shortcut.

Scope and limits: fitting retains the initial point, existing 45° segment directions and turns; it does not add bends to reach an off-ray straight target. Per-point displacement is capped at 300 map pixels. Invalid graph insertion, tight corners, reversal, self-overlap, parallel arrival and overlap that would fill an existing opening suppress alignment. No doors are cut automatically and the saved schema remains version 2. Unsafe or infeasible fitting retains the ordinary corridor drawing behavior; an invalid ordinary route still reports its existing geometry error. The minimum is the sum of squared corresponding bend displacement under fixed directions, not a global search for differently shaped routes.

### Version 0.8 verification — 2026-10-08

- `npm test`: **184/184 pass**, including **10 new** corridor end-fit/opening guard checks. The focused corridor suite passes **22/22**. Independent analytic optima, nonoptimal feasible competitors, exact fractional diagonal endpoints in eight orientations, straight reachability, displacement bounds, reversals, tight corners, self-overlap, non-mutation and the bounded 1000-point route pass. The original document, world center, geometry scale and pins remain governed by the existing validated model.
- `npm run test:corridor-end`: **12 real Electron interaction groups** and **10 independently expected route graphs** pass. Exact fractional midpoint **(5013.5,2602.5)** and existing door **(5013.5,1947.5)** alignment retain their fractional starts. The E→NE→N route moves both bends to the independently calculated minimum **(3206.75,3500)** and **(5013.5,1693.25)**. Live preview and automatic release agree; native project reopen, exact one-step undo/redo, cancellation and **1024 × 700** layout pass. No extra choice panel or renderer errors. Evidence: `artifacts/corridor-end-results.json` and `corridor-end-*-preview.png`.
- Raw aiming controls attraction: release **55.5 px** along a midpoint stays outside the zone even when its quantized endpoint is inside. A final **20 px** movement below the **35 px** sampling threshold correctly updates the target. No-target, off-ray straight and parallel-wall arrivals retain normal routes. Existing door ID, world position and **375 px** width remain exact; no door is added automatically.
- Reproduced and blocked an unsafe automatic correction that would place a rail over an unrelated door at **(4000,3290)**. General insertion intentionally permits wall overdraw, so successful clone insertion alone was insufficient. The new pure `corridorPreservesOpenings` guard rejects positive-length collinear overlap with existing door/erasure intervals before correction. The actual UI verifies both that door and a **300 px** erased gap survive the original-route fallback. Legal solid-wall subdivision and cut-boundary-only contact remain allowed.
- Final `npm run test:ui` passes construction, doors, room/corridor editing, history, zoom/pan, native save/open/cancellation, editable transparent PNG round trip and compact layout without renderer errors. All **1,631,246 visible pixels** in its **437,931-byte** 8192-square PNG are white. `npm run test:corridors` also passes all **seven existing start-alignment scenarios**, including diagonal starts, branch bounds, preserved openings and cancellation.
- `npm run package` and `npm run test:packaged` pass for **0.8.0**. All **15** checked bundled HTML, source JavaScript/CSS, Electron and ship files match current source byte-for-byte. Native project save/open and **1024 × 700** layout pass. `$env:PACKAGED='1'; npm run test:corridor-end` repeats all **12 interaction groups and 10 expected route graphs** in the rebuilt executable with no renderer errors. Evidence: `artifacts/packaged-results.json` and `corridor-end-packaged-results.json`. The packaged door and multi-bend preview screenshots were visually reviewed.
- `postpackage` refreshed the actual desktop link. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory, executable icon and existing referenced paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** with Windows Shell (`Invoke-Item`). Computer Use verified its actual executable window, visible working canvas/ship/controls and packaged **resources/app.asar/index.html** accessibility location. Selecting Corridor shows the new automatic endpoint guide. Left the clean **Untitled map**, **0 walls / 0 doors**, open in Corridor mode. No existing user map or backup was modified; original brief and source PNGs were unchanged.

## Diagonal corner attraction — version 0.7.1
- [x] Reproduce the screenshot silhouettes and isolate the new-wall start that creates tiny spurs/triangles.
- [x] Reuse the nearest solid corner before projecting a new wall start onto its side; preserve cuts, pins and exact import.
- [x] Complete geometry, actual drawing/history/raster UI checks and rebuild the Windows package.
- [x] Verify package/source equality and inspect/launch the actual desktop test shortcut.

Investigation: both attached silhouettes reproduce from the read-only existing desktop `kulmaongelmademo.revola.revola.json`, at **(5250,1640)** and **(6185,2575)**. The saved graph includes short extra arms and real erased intervals. Separately, a clean new drawing can create a tiny triangle: after walls **(2000,3000)→(3000,3000)→(3000,4000)**, starting a diagonal at **(2975,3025)** previously chose the closer side projection instead of the corner only **35.36 px** away. The corrected start reuses **(3000,3000)**. Reference PNGs, Finnish brief and user map files are unchanged. Old saved cuts remain exact; this fix prevents new near-corner start defects rather than silently editing imports.

### Version 0.7.1 verification — 2026-10-08

- `npm test`: **174/174 pass**. Seven diagonal joining tests cover the reproduced connected-corner triangle, all four mirrored starts, **256** direction/order combinations, reversed diagonal receiving faces, exact zero tolerance, erased ends, opening barriers and an alternate solid incident arm. Two additional renderer regressions cover tiny diagonal subdivisions/reversed drawing and preservation of a genuine **1.843 px** erased interval.
- `npm run test:diagonal` passes **nine real Electron interaction scenarios** with native save/reopen and exact one-step undo/redo. The two pictured bend orientations work in both drawing orders; starts near free ends and existing connected corners create shared vertices without spurs/triangles. Terminal dragging and overlapping redraw repair compatible old disconnected ends. **16 independent Canvas stroke comparisons**, including all eight rotations, find zero opaque-interior defects, exterior steps, translucent interior pixels or nonwhite wall pixels. Evidence: `artifacts/diagonal-results.json` and `diagonal-corner-editor.png`.
- The shared renderer also removes a reproduced internal **alpha 247** seam at an otherwise solid 45° corner. Miter fills overlap only already-solid incident runs by **0.25 map px**, retaining exterior coordinates, cut guards and the 75 px bound. Native smooth-corner probes at zoom **0.25/0.5/1/2/4** pass. The initial 1 px overlap caused one acute exterior export pixel to differ by 9 alpha units; it was reduced and the original export checks passed without relaxing their thresholds.
- `npm run test:ui`, `npm run test:joining`, `npm run test:doors` and `npm run test:corridors` pass existing construction, movement, room/corridor dimensions, door positioning, opening protection, history, white transparent PNG/project round trips, dialogs and compact layout. No unhandled renderer errors. Generic UI was rerun after the renderer change; the final focused source/package checks exercise the frozen geometry and renderer.
- `npm run test:raster` passes **8192 and 16384** with exact editable metadata, white visible pixels, transparent background, zero interior/background differences and pixel-exact whole ship. The expanded PNG is **767,595 bytes**, with **1,050,878 visible pixels**. Of **13,093,376** compared pixels, **3,325** differ only at silhouettes (74 above one alpha unit, maximum **8/255**); 38 differences occur at stripe-boundary rows, maximum **2/255**. Original rounding budgets remain unchanged. Memory remains bounded to a 16 MiB strip canvas and 12 MiB readback. Evidence: `artifacts/export-raster-results.json`.
- `npm run package` and `npm run test:packaged` pass for **0.7.1**. Bundled HTML, every source JavaScript/CSS file, Electron files and ship asset match current source byte-for-byte. Native save/open and **1024 × 700** layout pass. `$env:PACKAGED='1'; npm run test:diagonal` repeats all **nine interactions and 16 raster comparisons** in the rebuilt executable without errors, checking its bundled model/renderer/app bytes explicitly. Evidence: `artifacts/packaged-results.json` and `diagonal-packaged-results.json`.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory, executable icon and existing referenced paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** through Windows Shell (`Invoke-Item`). Computer Use verified the visible working editor, canvas/ship and controls, with accessibility location **resources/app.asar/index.html**. Left the clean new map open for testing. No existing user map or backup was modified.
- Limits: attraction remains bounded to the existing **50–100 map px** tolerance and requires an uninterrupted visible span. It does not pull an aim through a real door/erasure or silently delete old branches/cuts on import. The supplied demo's already-saved malformed corners therefore remain exact until edited: delete and redraw the affected corner, or fill the covered erased intervals through the normal wall tool. General branched deformation, detach/rejoin and advanced corridor routing remain deferred as previously documented.

## Interface cleanup — 2026-10-08
- [x] Remove the eight screenshot targets and redundant local badge; retain editing actions, concise live selection data and cohesive layout.
- [x] Verify geometry/persistence and actual source UI, including selection/clipboard controls and 1024 × 700 layout.
- [x] Rebuild and verify the current Windows package; inspect and launch the actual desktop test shortcut.

Scope: presentation cleanup only. Quick Guide and room rotation remain available. Fixed dimensions, graph constraints, centered expansion, ship ports and transparent editable PNG behavior are unchanged. The example is now a test fixture loaded through native Open rather than an onboarding action in the application.

### Cleanup verification — 2026-10-08

- Removed the welcome/example overlay, Wall System metrics/texture panel, selection instructions and clipboard note, duplicate document canvas/background/growth details, preview/export footer wording, logo, fixed-direction chip and offline/version footer. Also removed the redundant LOCAL badge. Actual selection statistics remain concise and disappear when there is no selection; Copy/Paste/Delete controls remain available. Removed obsolete DOM bindings and CSS; the header is consistently 56 px and the zoom controls remain aligned right. Compact rail/inspector widths apply correctly.
- `npm test`: **165/165 pass**. `npm run test:ui`, `npm run test:selection`, `npm run test:clipboard` and `npm run test:feedback` pass drawing, doors, rooms/corridors, group selection/movement, Copy/Paste/Delete, history, native save/open and compact controls. Expanded **791,991-byte** PNG round trip remains 16384 square with origin **(-4096,-4096)** and exact editable geometry. No unhandled renderer errors.
- `npm run package` and `npm run test:packaged` pass; version remains **0.7.0** for this presentation-only revision. Packaged HTML, every source JavaScript/CSS file, ship asset and Electron files match current source byte-for-byte. Native fixture Open, project save/reopen and **1024 × 700** window pass. `$env:PACKAGED='1'; npm run test:clipboard` passes all **eight** clipboard scenarios in the rebuilt executable. Evidence: `artifacts/smoke-results.json`, `selection-results.json`, `clipboard-results.json`, `feedback-results.json`, `packaged-results.json` and `clipboard-packaged-results.json`.
- Visually reviewed `artifacts/packaged-start.png`, `packaged-compact.png` and clipboard compact screenshots. The empty canvas has no onboarding overlay; targeted panels/labels are absent, selection actions remain usable and compact controls have no horizontal overflow. Source search confirms removed UI blocks have no remaining HTML/JavaScript/CSS references.
- `postpackage` refreshed the desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed actual target **<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe**, empty arguments, repository working directory, executable icon and existing referenced paths. Launched the exact **<desktop>\RevolaMapDrawer - testattava versio.lnk** through Windows Shell (`Invoke-Item`). Computer Use verified the visible editor, cleaned interface, available controls and packaged `resources/app.asar/index.html` location. Left the clean new map open for testing. No old editor was running before replacement; no user map or backup was modified.
- Limits: Quick Guide, room rotation, operational/error feedback, tooltips, current canvas heading dimensions and live selection statistics remain intentionally available. Geometry, file formats and the previously documented editing limitations are unchanged. Original brief and reference PNGs were not edited.

## Copy and paste point groups — version 0.7
- [x] Copy selected walls and walls between selected points, preserving shared corners, doors and erased openings in an immutable fragment.
- [x] Ctrl+C / Ctrl+V and Copy/Paste buttons, floating placement preview, invalid-placement feedback, cancellation, repeated placement and one-step undo/redo.
- [x] Geometry/persistence and source Electron clipboard checks; native text shortcuts remain unhandled by map commands.
- [x] Existing UI regression, rebuilt Windows package, packaged copy/paste verification and actual desktop shortcut handoff.

### Version 0.7 verification — 2026-10-07–08

- `npm test`: **165/165 pass**, including 15 new clipboard checks for induced walls, shared topology, immutable snapshots, fresh IDs, doors/gaps, fractional geometry, repeated paste, pins, invalid-contact/bounds rollback, centered expansion and exact project round trips. Translated coordinates use the model's nine-decimal precision so floating-point addition noise does not change a reopened document.
- `npm run test:clipboard`: **eight source Electron scenarios pass**, covering actual multi-point selection and Ctrl+C/V, door/gap preservation, rejected overlap, Escape, exact one-step undo/redo, repeated placement, buttons, source deletion and cross-project clipboard reuse, untouched native text shortcut events and the compact layout. No renderer errors. Evidence: `artifacts/clipboard-results.json`, `clipboard-point-group-preview.png`, `clipboard-cross-project-preview.png` and `clipboard-compact.png`; previews and controls visually reviewed.
- `npm run test:ui` and `npm run test:selection` pass existing drawing, door, room/corridor, movement, history, transparent export/import, native dialogs and all 11 monoselection/multiselection scenarios. No unhandled renderer errors.
- `npm run package` and `npm run test:packaged` pass for **0.7.0**. Every bundled source JavaScript/CSS file (including `src/clipboard.js`), HTML, ship asset and Electron file matches current source byte-for-byte. Native save/open and the 1024 × 700 window pass. `$env:PACKAGED='1'; npm run test:clipboard` repeats all **eight clipboard scenarios successfully in the packaged executable**, with no renderer errors. Evidence: `artifacts/packaged-results.json` and `artifacts/clipboard-packaged-results.json`.
- Saved the user's dirty v0.6 map through the native Save project dialog before closing the old build. New, readback-validated backup: `<desktop>\RevolaMapDrawer-kartta-varmuuskopio-ennen-0.7-2026-10-07.revola.json`, **9,770 bytes, 54 walls, one door, 16384 × 16384**. Existing backup files remain unchanged.
- On **2026-10-08**, `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed the actual desktop link's direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing referenced paths. Launched that exact `.lnk` with Windows Shell. Computer Use verified the working **v0.7** editor and its Copy/Paste controls, then reopened the new user backup through the native Open dialog. Left the clean **54-wall, one-door, 16384-square** map open in Select mode for testing. No user map modifications were made after reopening.
- Limits: clipboard is local to one running editor window, survives New/Open, and is cleared on app exit. It omits loose points, exterior connections and the fixed ship. Paste uses the destination style and does not auto-join; centerline contact, crossings/overlap, fixed port placement and invalid bounds reject the entire edit. Wall-thickness collision rules are unchanged. No rotation, mirroring or scaling of the copied group is added.

## Corridor start alignment — version 0.6
- [x] Gentle alignment to the midpoint between wall turns/branches, ignoring incidental straight splits.
- [x] Prefer an existing door's exact center near its opening; retain fractional and diagonal centers.
- [x] Shared hover/gesture target, visible CENTER/DOOR feedback, exact preview/commit origin and unchanged doors.
- [x] Geometry and UI checks, rebuilt Windows package and actual desktop shortcut handoff.

### Version 0.6 verification — 2026-10-07

- `npm test`: **150/150 pass**, including 12 new corridor-targeting checks for bounded midpoint/door attraction, fractional centers, reversed diagonal walls, incidental splits, branches, pins, erasures, nearest-wall precedence and no document mutation.
- `npm run test:corridors`: **seven real Electron interaction scenarios pass**. An aim 35 px along and 15 px off a wall resolves to its exact off-grid midpoint **(2413,2602)**. A start 123 px from an existing door center resolves to **(2413,1947)**. Both corridor rails begin at the same target cross-section, retain **580 px** center separation, share proper wall junctions, and preserve the existing door ID, position and **375 px** opening. Reversed diagonal placement, branch-bounded midpoint, unassisted grid placement, native project save/open, exact one-step undo/redo and Escape cancellation pass. Hover and gesture markers were checked in the canvas; CENTER/DOOR previews were visually reviewed. Evidence: `artifacts/corridor-results.json`, `corridor-centered-hover.png`, `corridor-door-preview.png` and `corridor-diagonal-preview.png`.
- `npm run test:ui` passes the existing drawing, door, room, bent-corridor, movement, history, transparent export/import, native dialog and 1024 × 700 layout scenarios. No unhandled renderer errors.
- `npm run package` and `npm run test:packaged` pass for **0.6.0**. Every bundled source JavaScript/CSS file (including `src/corridors.js`), HTML, ship asset and Electron file matches current source byte-for-byte. Native save/open and the compact window pass without renderer errors. Evidence: `artifacts/packaged-results.json`.
- No packaged editor was running before replacement, so no new user backup or forced close was needed. `postpackage` refreshed `<desktop>\RevolaMapDrawer - testattava versio.lnk`. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing referenced paths. Launched that exact shortcut with Windows Shell. Computer Use observed the working **v0.6** editor and its new corridor guide. The editor is left open for testing.
- Limits: alignment affects the start only and does not force the departure direction. For both corridor boundaries to attach to the starting wall, draw perpendicular to that wall. Existing geometric checks still reject unsafe overlaps/tight bends; solid walls are not automatically pierced. Erased gaps and fixed raster ship artwork are not doorway targets. Farther aims retain ordinary grid starts.

## Multiple walls and points — version 0.5
- [x] Select enclosed walls/points with a left-button rectangle in Select mode; Ctrl-click toggles and Ctrl-marquee adds.
- [x] Move the selected group with a common translation and one undo step, preserving shared points, cuts, constraints and pins.
- [x] Clear/cancel selection, delete the selected set, native save/open and legacy single-item dragging regression checks.
- [x] Geometry/UI verification, rebuilt Windows package and actual desktop shortcut handoff.

Selection is temporary UI state. Group movement preserves relative geometry; attached stationary walls can limit the shared movement direction. Conflicting connections or selected fixed ship ports block the whole move. Include adjoining geometry in the selection to move a larger group. Existing single room-side resizing remains available through an ordinary single selection.

### Version 0.5 verification — 2026-10-07

- `npm test`: **138/138 pass**, including 14 group-movement checks and five selection-helper checks. Coverage includes shared-point deduplication, mixed point/wall selections, diagonal constraints, door/gap preservation, pinned ship ports, invalid-geometry rollback, centered expansion and persistence.
- `npm run test:selection`: **11 interaction scenarios pass** in the real Electron UI. Both marquee directions, Ctrl-click toggling, Ctrl-marquee addition, walls/points/mixed groups, exact common translation, one-step undo/redo, deletion, native project reopen and legacy single-wall dragging pass. Selection alone does not dirty the document. Escape cancels a preview or clears idle selection; returning a drag to its start creates no edit. Incompatible stationary connections block the whole move without partial changes. The rectangle and green group highlights were visually reviewed. Evidence: `artifacts/selection-results.json`, `selection-marquee-preview.png`, `selection-selected-group.png` and `selection-ctrl-marquee.png`.
- `npm run test:ui`, `npm run test:feedback`, `npm run test:joining` and `npm run test:doors` pass existing editing, history, joining, opening, room/corridor, export/import and compact-window behavior. Expanded PNG round trip remains **791,991 bytes**, 16384 square, with the original center, scale and editable geometry preserved.
- Saved the user's dirty version 0.4 map through its native Save project dialog under the previously authorized backup-and-close flow. New backup: `<desktop>\RevolaMapDrawer-kartta-varmuuskopio-ennen-0.5-2026-10-07.revola.json`, **8,912 bytes, 50 walls, 7 doors, 8192 × 8192**, validated on readback before closing the old app. Earlier backups remain untouched.
- `npm run package` and `npm run test:packaged` pass for **0.5.0**. Packaged HTML, every source JavaScript/CSS file (including `src/selection.js`), Electron files and ship asset match source byte-for-byte. Native save/open and the 1024 × 700 window pass without renderer errors. Evidence: `artifacts/packaged-results.json`.
- `postpackage` refreshed the actual desktop shortcut. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed the direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing referenced paths. Launched that exact `RevolaMapDrawer - testattava versio.lnk` with Windows Shell. Computer Use observed the working **v0.5** editor and opened the new backup through the native Open dialog. The clean **50-wall, 7-door** map is left open for testing.
- Limits: marquee selects fully enclosed walls and enclosed points, not every wall crossed by the rectangle. Group moves preserve a common translation and do not detach, auto-join or deform the group. Stationary adjoining walls constrain direction; conflicting constraints, crossings and selected ship pins reject the move. Selecting a wider connected group permits more movement. Explicitly selected point deletion removes its incident walls; endpoints included only through selected walls do not delete neighboring walls.

## Door centering and small wall-face gaps — version 0.4
- [x] Gentle midpoint attraction between turns/branches, shared by preview and placement, including diagonal walls and incidental collinear splits.
- [x] New 375 px doors can cross incidental splits while preserving other openings, structural joints and fixed ship ports.
- [x] Small wall-face gaps become shared graph junctions when either participant is drawn or moved; old gaps can be repaired by redrawing their stub.
- [x] Real door/eraser cuts, existing opening positions, exact imports and undo/redo remain protected.
- [x] Complete regression checks, rebuild the Windows app and verify the actual desktop shortcut.

### Version 0.4 verification — 2026-10-07

- `npm test`: **119/119 pass**, including turn/branch/pin-bounded centering, invalid midpoint fallback, split consolidation, diagonal physical width, multiple face joins, moved/room/corridor receivers, intentional gaps, protected pins and cut world positions after successive split/extend operations.
- `npm run test:ui` passes drawing, history, rooms/corridors, native PNG/project save/open, cancellation, invalid import preservation and the compact window, without unhandled renderer errors.
- `npm run test:doors` passes actual UI midpoint placement between turns and branches, reversed diagonal walls, a door across reversed collinear subdivisions, off-center aiming outside the 50 px threshold, native project save/open, removal and exact undo/redo. Raster inspection retains a **375 px** opening without extra cracks. All three near-T cases (new wall, receiving wall drawn last, old stub redrawn) become a shared degree-three junction. CENTER preview and closed T were visually reviewed. Evidence: `artifacts/door-results.json`, `door-midpoint-preview.png` and `door-tee-repaired-editor.png`.
- `npm run test:feedback` and `npm run test:joining` pass: general erasing, room resizing, opening fills, rotation guide, centered 16384 expansion, **791,991-byte** native expanded PNG round trip, prior corner attraction and exact undo/redo. Overlapping wall extensions still match the single-stroke raster pixel-for-pixel; both upper airlock mirror orientations retain the 375 px opening.
- `npm run test:raster` passes at both 8192 and 16384, with exact metadata, white visible pixels, transparent background and unchanged whole-ship raster. Expanded output: **767,592 bytes**, **1,050,878 visible pixels**. All compared solid interiors and background away from silhouettes match exactly; the same bounded Canvas silhouette alpha-rounding differences remain (3,325 of 13,093,376 compared pixels, maximum 8/255; 38 at stripe-boundary rows, maximum 2/255). No interior cracks. Memory remains bounded to a 16 MiB strip canvas and 12 MiB readback. Evidence: `artifacts/export-raster-results.json`.
- `npm run package` and `npm run test:packaged` pass for **0.4.0**. Packaged HTML, ship asset, every source JavaScript/CSS file (including the new `src/doors.js`) and Electron files match current source byte-for-byte. Native save/open and 1024 × 700 window pass with no renderer errors. Evidence: `artifacts/packaged-results.json`.
- `postpackage` refreshed the actual desktop link. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing referenced paths. Launched that exact `RevolaMapDrawer - testattava versio.lnk` through Windows Shell. Computer Use verified the visible working editor and **v0.4** in its UI, then opened the existing user backup through the native dialog. Left the clean **102-wall, 14-door, 16384 × 16384** map open in the shortcut-launched version. The backup file was not overwritten.
- Limitations: centering is a subtle default attraction within 50 map pixels or 5% of the visible straight span. Small face joins only extend compatible solid free ends; unsafe optional joins are rejected. Imports preserve existing geometry; redraw an old near-wall stub to repair its gap. The fixed ship artwork remains protected.

## Wall joins and airlock — version 0.3
- [x] Nearby wall ends snap to a shared corner during drawing and dragging, with directions and ship pins preserved.
- [x] Straight wall texture follows world coordinates; graph splits, drawing direction and overlapping extensions do not introduce seams or steps.
- [x] Sharper bounded miter joins replace round corner covers while keeping erased cuts open.
- [x] Fixed ship prefab includes its original upper 375 px doorway, with unchanged world anchor and lower hull pixels.
- [x] Actual UI joining/undo/reopen regression and updated transparent export checks.
- [x] Rebuilt version 0.3 Windows app and actual desktop shortcut handoff.

User's open test map was saved through the existing app's native project dialog before closing it, with user authorization. Backup: `<desktop>\RevolaMapDrawer-kartta-varmuuskopio-2026-10-07.revola.json` (19,735 bytes, 102 walls, 14 doors, 16384 square; validated on readback). The backup is outside the repository and will not be overwritten by tests or packaging.

### Version 0.3 verification — 2026-10-07

- `npm test`: **90/90 pass**, including undershot/overshot corners, whole-wall attraction, diagonal/T-junctions, near-collinear extensions, preserved cut positions and pinned ports, unchanged room resizing, atomic rollback and 75 px miter boundary clearance.
- `npm run test:joining`: real UI terminal and whole-wall drags join nearly aligned perpendicular ends into one vertex; undo/redo is exact. Four offset, overlapping forward/reverse strokes remain one collinear coverage; **864,000 raster pixels** match a one-stroke reference exactly. Normal and mirrored upper airlock door scans both measure **375 px**, with white visible pixels. Evidence: `artifacts/joining-results.json` and `joining-*-editor.png`.
- Renderer comparison also covers **30,720,000 pixels** over all four wall orientations and zoom factors 0.3/1/2: split/reversed walls and single walls have **zero differences**. Visual review confirms continuous texture and sharp 90°/45° corners in `artifacts/wall-rendering-preview.png`.
- `npm run test:ui` and `npm run test:feedback` pass existing drawing, room resizing, doors/fills, eraser, history, expansion and native save/open cases. Expanded feedback PNG: **791,991 bytes**, 16384 square, unchanged center/scale, exactly restored editable metadata. No unhandled renderer errors.
- `npm run test:raster` covers both canvas sizes with sharp corners straddling export stripes. At 16384: **767,610 bytes**, **1,050,852 visible white pixels**, **267,384,604 transparent pixels**. All solid interiors, clear background away from silhouettes and complete mirrored ship match reference renders exactly. Of **13,093,376 compared pixels**, 3,325 silhouette pixels differ (3,251 by just 1 alpha unit; maximum 8/255); 38 are on stripe-boundary rows, with maximum 2/255. These are bounded Canvas edge-coverage rounding differences, not interior cracks. The test explicitly rejects even a one-alpha difference in solid interiors and keeps the 0.01% budget for differences above one alpha unit. Export remains bounded to a 16 MiB strip canvas and 12 MiB pixel readback. Full evidence: `artifacts/export-raster-results.json`.
- `npm run package` and `npm run test:packaged` pass for **0.3.0**. The packaged HTML, all source JavaScript/CSS, Electron files and updated ship asset match source byte-for-byte. Native save/open and the 1024 × 700 window pass without renderer errors.
- `postpackage` refreshed the actual desktop shortcut. `-VerifyOnly` confirmed target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing referenced paths. Launched the exact `.lnk` with `Invoke-Item`; Computer Use observed the working editor, upper airlock doorway and new joining guide. Opened the user's saved backup through the native Open dialog in that shortcut-launched build; its **102 walls, 14 doors and 16384 dimensions** are visible. Left that clean, reopened map available for continued testing.
- Limitations: attraction extends/trims compatible nearby free ends and supports valid T-junctions; it does not arbitrarily deform complex branched networks. Unsafe attraction falls back to the legal unsnapped edit or rejects a conflicting edit. Existing disconnected ends are not silently modified on import; drag or redraw near them to join. New rendering changes older maps' silhouette while preserving their graph, openings, style and world positions. The ship remains protected raster content.

## Tester feedback — version 0.2
- [x] General eraser with adjustable brush, continuous strokes and one undo step per stroke.
- [x] Recognizable room wall dragging resizes the room while preserving its chamfers.
- [x] Drawing over door openings fills covered portions; a partially filled opening loses fixed-door semantics.
- [x] Quick Guide explicitly explains 45° room rotation and exposes a convenient control.
- [x] Drawing outside the default canvas expands to centered 16384 × 16384 without moving or scaling existing content.
- [x] Default wall roughness reduced from 3 to 2.25 (25%).
- [x] Backward-compatible projects and memory-bounded transparent 16384 PNG export/open.
- [x] Automated and UI feedback regression checks, rebuilt Windows app and actual desktop shortcut launch.

### Version 0.2 verification — 2026-10-06

- `npm test`: **74/74 tests pass**, including room resizing, gap erasing/filling, pinned attachments, transactional canvas expansion, legacy project migration and streamed PNG encoding.
- `npm run test:ui` and `npm run test:feedback`: actual Electron interactions pass all six feedback scenarios, exact undo/redo and native save/open. A **788,867-byte, 16384 × 16384 PNG** reopens with identical editable metadata and supports further editing. Its origin is **(-4096, -4096)**; original geometry, ship position, world center and scale are preserved. See `artifacts/feedback-results.json`.
- `npm run test:raster`: both 8192 and 16384 exports decode correctly with white visible pixels and transparent background. The expanded sample has **893,283 visible** and **267,542,173 transparent pixels**. All **135,664 compared stripe-boundary pixels** and the entire mirrored ship exactly match independent reference renders. Elsewhere, 69 of 13,093,376 reference pixels differ only in antialias alpha (maximum 8/255) from Canvas coordinate rounding. Export uses a 16384 × 256 strip canvas (16 MiB) and at most 12 MiB per pixel readback, avoiding a full-map RGBA allocation. See `artifacts/export-raster-results.json`.
- `npm run package` refreshed the desktop shortcut automatically. `npm run test:packaged` confirms **0.2.0**, bundled `resources/app.asar/index.html`, the eraser and rotation guide, native save/open, default roughness 2.25 and the compact 1024 × 700 window, with no renderer errors. Every bundled `src/*.js`, `src/*.css` and `index.html` was also compared byte-for-byte with the current source and matches.
- Read back the actual desktop `.lnk` using `scripts/update-desktop-shortcut.ps1 -VerifyOnly`: target remains `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, arguments empty, working directory `<repository root>`, and all referenced paths exist. Launched that exact shortcut through Windows Shell (`Invoke-Item`); Computer Use confirmed the visible **Untitled map — Revola Map Drawer** editor from that executable, with the eraser, centered canvas, ship and prominent 45° Quick Guide. The editor is left open for testing.
- Room resizing deliberately recognizes rectangular/chamfered closed outlines, including fixed doors and compatible attached walls. Arbitrary erased gaps, ambiguous shared boundaries and unsupported outlines retain local wall editing. The ship remains protected raster content. Existing projects preserve their saved roughness; 2.25 is the new-map default. Version 0.2 reads version 0.1 projects, but its new saves require version 0.2.

## Planning and reference
- [x] Read original Finnish implementation brief.
- [x] Write agent-oriented design and checklist maintenance protocol.
- [x] Inspect both references on black; measure dimensions and extract ship/airlock.

## First runnable milestone
- [x] Standalone Electron shell and launch flow.
- [x] English dark editing workspace, zoom and pan.
- [x] Graph-backed white walls constrained to 0/45/90 degrees.
- [x] Fixed-size door placement and removal.
- [x] Ship/airlock anchor and horizontal mirror.
- [x] Undo/redo and safe new/open behavior.
- [x] Transparent PNG export with editable metadata.
- [x] Validated PNG/project import and project fallback.
- [x] Chamfered room primitive, including rotated placement.
- [x] Constant-width freehand corridor tool for simple non-overlapping routes.
- [x] Connected corner/wall dragging with angle constraints for unbranched joints.
- [x] Pin existing wall attachments to both ship ports during dragging.
- [ ] Extend constrained dragging to arbitrary branched wall networks (three or more walls at a joint).
- [ ] Explicit detach/rejoin operation beyond deleting and redrawing walls.
- [ ] More advanced corridor routing through self-intersections and very tight turns.

## Verification and handoff
- [x] Automated geometry and serialization tests pass.
- [x] UI smoke test covers wall, door, history, zoom and export/open.
- [x] UI smoke test covers wall/corner dragging, exact undo restoration, room rotation and corridor turns.
- [x] Packaged Windows application launches without development server.
- [x] Packaged native save/open and compact 1024 × 700 window verified.
- [x] README describes launching, tools, file behavior and known limitations.
- [x] Mandatory desktop shortcut policy recorded in `AGENTS.md` and README.
- [x] Every successful `npm run package` refreshes the desktop shortcut through `postpackage`; `npm run shortcut` repairs it independently.
- [x] Actual desktop shortcut properties and referenced paths verified, then launched through Windows Shell to a visible working editor.

## Evidence / remaining work
Verified first runnable milestone on 2026-10-06. The original folder contained only the brief and two 8192 × 8192 reference PNGs. At that milestone the folder was not a Git repository, and no commit or publication was requested. The current distribution preparation is recorded above.

- `npm test`: **38/38 tests pass**, covering geometry, graph import topology, door clearance, pinned ports, movement rollback, PNG integrity/limits and renderer determinism.
- `npm run test:ui`: actual Electron renderer with native file dialogs stubbed in the test only; real preload, IPC and filesystem writes. Walls, doors/removal, rooms, rotated rooms, corridor turn, movement, history, zoom/pan, mirrored ship, export/open, canceled dialogs, dirty close and invalid import preservation pass. No unhandled renderer errors.
- Export evidence: **1,691,194-byte PNG**, **2,168-byte document JSON** (+26-byte PNG metadata framing). The metadata overhead is about **0.13%** of this test file. Reopened graph exactly matches the source project.
- Raster inspection: **8192 × 8192**, **65,488,837 fully transparent pixels**, **1,620,027 visible pixels, all pure white RGB**. Door clear raster run is 374 px due to antialiasing at fractional boundaries; its vector interval is exactly 375 px.
- `npm run package` and `npm run test:packaged`: Windows x64 EXE loads its packaged `resources/app.asar/index.html`, writes and reopens a 36-wall/two-door example with no development server. Minimum 1024 × 700 window keeps the canvas and main actions accessible; the inspector scrolls.
- Visual QA: `artifacts/editor.png`, `artifacts/example.png`, `artifacts/editor-compact.png`, `artifacts/packaged-start.png`, `artifacts/packaged-example.png`, `artifacts/packaged-compact.png`.
- Machine-readable results: `artifacts/smoke-results.json` and `artifacts/packaged-results.json`. Test maps and build outputs are local generated artifacts, excluded from source control.

The MVP is complete. The wider design remains open for branched network deformation, dedicated detachment and advanced corridor routing. Existing reference PNGs have no editable metadata and are reference assets only. The ship/airlock is a fixed faithful raster crop, not an editable wall graph. Reference dimensions are measured interpretations; no game engine numeric specification was supplied.

## Desktop test shortcut handoff — 2026-10-06

- Shortcut: `<desktop>\RevolaMapDrawer - testattava versio.lnk` (machine-only, outside the repository).
- Target: `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`.
- Arguments: empty. Working directory: `<repository root>`. Icon: same executable, index 0. All referenced paths exist.
- Rebuilt through `npm run package`; automatic `postpackage` creation and read-back verification succeeded. `npm run test:packaged` passed native save/open against the rebuilt app. `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirmed the saved link's exact properties.
- Launched the actual `.lnk` with Windows Shell (`Invoke-Item`). Computer Use verified the visible **Untitled map — Revola Map Drawer** window, loaded from the packaged `resources/app.asar/index.html`, with drawing tools, canvas, ship and save controls. The test editor is left open for the tester.
- Repeat the shortcut inspection and actual launch at every completed version handoff. If the build is not testable, record that explicitly; do not claim a working shortcut.
