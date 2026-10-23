# Implementation checklist

Update on every verified milestone. `[x]` verified, `[-]` in progress, `[ ]` pending.

## Door-neighbor NPCs, ship exclusion and browser updates — 2026-10-24

- [x] Reproduce the supplied source with the 0.15 generator: its complete 15-object
  result and generation stamp match exactly. Production was 0.16.0; all saved
  pickup rotations being zero came from the old generator. The source is read-only.
- [x] Isolate the separate capacity issue: the old 752.98-pixel door circles
  rejected all 1,419 otherwise clear NPC candidates and every crate candidate.
- [x] Apply the owner's clarified automatic rules: NPCs can stand beside doors
  and one another, with physical nonoverlap; all automatic non-door categories
  stay outside the ship. Static props retain door travel and passage clearance.
- [x] 387 unit cases, full source/packaged UI, web/offline and both game-host
  suites pass. Extracted 0.16.1 portable ZIP saves/reopens its exact graph offline
  with zero network requests and renderer errors. All ZIP bytes are verified.
- [x] Exact source/packaged/web UI probes generate 10 NPCs, 2 weapons, 1 device
  and 2 barrels outside the ship with randomized facing; old-policy replacement,
  cancellation, Undo/Redo and reopen are exact and architecture SVG is unchanged.
  The original personal source remains byte-identical and stays out of Git.
- [x] Browser footer shows Version 0.16.1 and its build. Waiting-update unit
  tests and the real worker lifecycle preserve unsaved edits, activate only
  after the last old tab closes and retain offline use on the next visit.
- [-] Verify matching Unity editor/runtime generation and final game resources.
- [ ] Record final delivery and publication evidence for 0.16.1.

## Release 0.16.0 — 2026-10-24

- [x] Select version 0.16.0 for the accepted population/regeneration changes;
  package, lockfile and dated changelog agree. User authorized both main pushes,
  production Vercel deployment and a new GitHub release.
- [x] Full local release build passes: 373 unit cases, source/packaged UI suites,
  ZIP byte/checksum validation and extracted offline native save/reopen with an
  exact graph round trip, no renderer errors and no network requests.
- [x] Inspect the actual refreshed desktop shortcut: canonical 0.16.0 executable,
  empty arguments, repository working directory and all paths exist. Shell launch
  starts the packaged app; its four owned hidden processes were closed afterward.
  After publication the same actual shortcut was launched normally and its clean
  Untitled map editor was observed through native window capture, then closed.
  The extracted application's UI is also verified by the portable test above.
- [x] Push Drawer preparation `dc311cb` and matching Revola integration
  `d04e2852` to their main branches. Synchronize 40 runtime files from the clean
  tagged Drawer source, rebuild the Jint producer and offline renderer, and run
  UserMapBuildSupport.Prepare. Audit/copy the game resource with only its revision
  changed; all other serialized fields and its meta remain identical.
- [x] Windows x64 release validation: build succeeds (0 errors, 2 warnings),
  then a fresh isolated player completes create/save/launch/edit/relaunch/return,
  controller checks, fixture-derived rotations/flags and no-placement fallback
  with exact saved-plan reopen. Native fallback counts are 4 and 16 NPCs for the
  maintained and user-supplied fixtures. Original user source remains unchanged.
  Proof: companion Builds/PopulationRelease0160Retry/proof/result.json.
  The first attempt's whole-frame control comparison included changing UI;
  the successful retry compares the map crop. No production code was changed.
  This fresh result supersedes the earlier blocked standalone check below.
- [x] Production Vercel deployment is ready at
  https://revolamapdrawer.vercel.app, build `097f799c360a1104`. All seven files
  match local SHA-256 hashes. Production web/offline and population smoke pass;
  expanded legacy-map confirmation/cancel/replacement/Undo/Redo also pass using
  an ignored adapter of the maintained history smoke. No local map-action traffic.
- [x] GitHub Verify application run 40027254795 and Build release run 40028043276
  pass. Downloaded draft assets match their SHA-256 checksums and all 77 portable
  ZIP files match the verified local package byte-for-byte. Published
  [v0.16.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.16.0)
  as the latest stable release at the owner's request; original assets retained.
  Published ZIP SHA-256:
  `899ff332c8994601d5107c72c0f4f9f5c46827b120be59c737d879fe5f697c90`.

The following implementation sections retain their historical pre-publication
state. Release 0.16.0 and the production web update are now published.

## Global NPC density and expanded-map regeneration — 2026-10-23

- [x] Reproduce the user's saved map independently of placement history:
  previous room policy placed one NPC, original generator nine. The largest
  5.39-world-square-unit room incorrectly qualified for a small-room empty roll.
- [x] Restore the global area target with a 10% increase. Spread preferred 2–6
  room quotas first, then use safe overflow capacity in active rooms. Preserve
  intentionally empty rooms and explicit fixed-count tuning.
- [x] Actual user source in the packaged desktop now generates ten NPCs, with
  unchanged architecture, working confirmation/cancellation and exact Undo/Redo.
  Original source bytes untouched; personal fixture/proofs remain ignored.
- [x] Include the population policy revision in the generation signature so an
  older generated result can be replaced through Generate without changing walls.
  Track unstamped legacy geometry across editing previews; expansion then
  Generate replaces all categories after confirmation. New/Open resets the
  session baseline. Initial hand-placed categories remain preserved.
- [x] 373 unit tests passed. Full source/packaged UI, web/offline and both game
  host smoke suites passed, including real expanded-area confirmation,
  cancellation, regeneration, Undo/Redo and source save/reopen.
- [x] 96 distinct companion Unity cases have passed across the recorded cohorts,
  including both reserves (NPC counts 6 → 9 and 8 → 11), runtime persistence,
  automatic stale-plan rebuild and zero-target/no-capacity guards. The final
  enlarged in-memory overflow fixture passes with room counts 2,14,4,0,0,3,14,5;
  every NPC retains a certified entry-safe motion cell. Early runs exposed stale
  copied defaults and insufficient/float-rounded test geometry; these were
  corrected without weakening production safety.
- [x] Final vendored source/provenance, Jint exporter and embedded renderer
  rebuilt. Windows x64 build succeeds (0 errors, 2 warnings), with final resource
  preparation through UserMapBuildSupport.Prepare in the isolated build hook.
- [x] Final desktop package matches source; user's map still yields ten NPCs.
  Actual shortcut target, empty arguments, working directory and paths verified;
  shortcut launched hidden and only its four hidden test processes closed.
- [ ] A new standalone Windows-player create/edit/save/launch/reopen run was
  blocked by automatic approval review (`blocked by policy`). The earlier
  initial-policy player proof must not be presented as this revision's result.
  User also stopped native Windows automation with Escape; no later visible
  native shortcut observation was made. Packaged renderer/UI and both game-host
  flows were verified with the automated suites above.

Limits: room preferences can be exceeded to preserve whole-map density;
geometry and safety can still reduce actual counts. A completely unstamped
legacy source saved/reopened after expansion but before its first generation
does not contain enough history to recover the earlier geometry. Existing
stamped generation history survives save/reopen. Changes remain local; no web
deployment or Git release.

## Balanced automatic population — 2026-10-23 (initial policy)

The NPC target rule below is superseded by the density correction above.

- [x] Align desktop/web/embedded editable generation with Unity editor/runtime
  fallback: room NPC quotas, occasional empty small rooms, independent NPC
  behavior variations, randomized prop/pickup facing and 20% more clustered props.
- [x] 368 unit tests pass. The three-room fixture has 2/4/6 NPCs; forced empty
  small rooms are never refilled. Statistics check 15% independent flags/empty
  rooms and expected 4.8/2.4 saturated prop counts. Fixed tuning and manual
  category overrides retain their behavior. Mixed piles preserve full clearance.
  No eligible safe room retains the original positive target/shortfall feedback;
  intentionally empty eligible rooms retain a zero target.
- [x] Full source/packaged UI suites and web/offline suite pass, plus final
  source/web population smoke and source/packaged game-host smoke (zero separate
  visible windows). Generation, save/reopen, geometry-change confirmation,
  cancellation and Undo/Redo pass; architecture exports remain unchanged.
- [x] Companion Unity core cohort: 64/64 passed, including real scene application,
  generated/imported NPC settings and rotations, native door comparisons, authored
  categories, original automatic fallback and exact saved-plan reopen.
- [x] Final Unity no-capacity guards and two reserve maps: 4/4 passed. Total
  companion cohort is 68/68; actual NPC flags and rounded loadouts match the plan.
- [x] Windows x64 build succeeds (0 errors, 2 warnings). Companion
  `Builds/PopulationValidation/proof/result.json` reports `passed: true` for the
  complete embedded create/save/launch/edit/relaunch/return flow, fixture-derived
  rotations/settings, no-placement fallback and exact saved-plan reopen. The
  fallback plan has four NPCs and true stay-far variations; all room caps pass.
  First probe stopped at an obsolete keyboard click coordinate; updating the
  ignored probe to the observed current name-field location fixed the retry.
  Source/packaged keyboard suites already passed. No production UI code changed.
- [x] Original Unity checkout prepared through UserMapBuildSupport.Prepare;
  canonical defaults exported/synced, complete vendored snapshot and provenance
  refreshed, Jint exporter rebuilt and embedded renderer repackaged.
- [x] Desktop package rebuilt with canonical defaults; actual shortcut paths,
  arguments and working directory verified, Shell launch and visible clean
  editor observed after the final rebuild (PID 34776). Left the clean packaged
  editor open. Actual target, executable icon and all paths exist; arguments are
  empty and the working directory is the companion repository root.

Limits: portable vector/native generation shares policy, not exact coordinates;
geometry, clearances and the profile global cap can reduce realized counts.
The Windows probe's background mouse produced existing SACharacterMoverScr
out-of-frustum logs/development-console text; assertions and normal exit passed.
Original/clone Steam source bytes match after cleanup and temporary probes were
removed. Changes remain local; production web/Git release was not published.

## Release 0.15.0 and automatic door artwork — 2026-10-23

- [x] Automatic doors no longer always use the sliding sprite. A cached derived
  preview uses the exported audited sliding footprint, continuous wall support,
  complete pockets and inflated track geometry. Generated and reopened `auto`
  objects and hover/drag previews use hinged/sliding artwork appropriately.
  Explicit choices retain their artwork. Source types and Unity's native
  mechanism/sweep certification remain unchanged.
- [x] 362 unit tests pass, including subpixel pocket interruptions and transient
  preview data. Source, rebuilt desktop and web population smoke compares actual
  automatic-door canvas pixels to explicit resolved types, and covers save/reopen,
  regeneration confirmation, cancellation and Undo/Redo. Both game smoke modes
  pass with zero separate visible windows. Full web/offline checks pass.
- [x] The canonical ten-door source matches all ten mechanisms in the prior
  Windows player's plan. Unity's new editor regression also compares derived
  preview kinds with certified native door plans before actual scene application.
- [x] Final Unity runtime retry passes 1/1 after the initial Windows atomic-file
  lock. A fresh Windows x64 game build has zero errors; its complete visible
  create/save/launch/pause/edit/relaunch/return probe passes, including all ten
  preview kinds compared to actual native doors. Companion proof:
  `Builds/DrawerDoorPreviewValidation/proof/result.json`. Editor screenshot
  inspected; isolated probes removed and Steam source restored byte-for-byte.
- [x] Full local release builder passes 362 tests, complete source/packaged UI
  suites, ZIP checks and the extracted portable app. GitHub main verification
  [39970047756](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39970047756)
  and release build
  [39970726093](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39970726093)
  both succeed. Immutable `v0.15.0` tags release commit `cd20a52`.
- [x] Downloaded GitHub's exact ZIP/checksum, verified all 77 delivered files and
  ran the extracted offline save/reopen test (zero network/renderer errors).
  Initial comparison exposed only CRLF/LF differences in five local files: CI
  bytes matched the tag, and aligning local bytes with canonical LF plus a local
  rebuild made every file identical. Release code/assets were not replaced.
  Published ZIP SHA-256:
  `ac4f6caab46419d64984752c596127fea85eb741926f0da632a58aa1ff41e880`.
- [x] Published [v0.15.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.15.0)
  as latest, with the ZIP and checksum. Older tags/assets remain unchanged.
- [x] Production Vercel deployment `dpl_E3usKqRmTnp3PVEjeqxnN1AXvk5o` is READY
  at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app). Direct
  production/offline/export and generation/door-pixel tests pass; zero uploads
  or third-party requests. Prior cached tabs keep their editor until closed.
- [x] Companion `main` includes the complete clean 40-file 0.15.0 snapshot from
  release commit `cd20a52`, matching renderer/producer/resources. Its code commit
  is `b2628fb6`. Desktop shortcut target/arguments/working directory were checked
  and the actual shortcut launched after the final package rebuild.

## Editable default objects and controller pan swap — 2026-10-23

- [x] Previous checkpoint committed/pushed to both `main` branches: Drawer
  `8f48f46`, Revola `8c2d2bc8`. The following feature work remains local.
- [x] Embedded controls now use right stick cursor, left stick pan with the
  owner's existing direction preference, and physical D-pad scroll/zoom.
  ZoomIn/ZoomOut actions have no separate path; gameplay bindings are unchanged.
- [x] A separate Generate button below OBJECTS works in desktop, web and game.
  Shared offline implementation uses the prepared Unity defaults, audited
  footprints, current weapon/device pools, 70/20/10 NPC loadouts and crate loot.
  Initial generation skips each category containing valid hand placements.
  Absent categories still use the game's existing automatic generation.
- [x] Changed geometry after generation prompts before removing all old objects,
  explicitly including hand placements. Cancel preserves the complete source;
  confirmation replaces objects and the generation signature in one Undo step.
  Source reopen, Undo/Redo, progress cancellation and double clicks are covered.
- [x] 360/360 unit tests pass. Full UI/packaged suites and web offline suite pass;
  final population smoke passes in source, rebuilt desktop package and web build.
  Final source/packaged game smoke also exercises Generate/Undo, file operations,
  controller keyboard and pixels with zero separate visible windows.
- [x] Companion Unity verifies all 14 targeted cases across the parser cohort,
  workflow retry and final 2/2 placement integration run. The actual generated
  objects pass editor scene application, preserve unarmed loadouts, reopen their
  runtime plan identically and leave untouched sources automatic. An initial
  integer/float snapshot comparison and a real door-sweep collision were fixed;
  the final generator reserves conservative door travel. This is portable vector
  placement with Unity's defaults, not identical random coordinates or a browser
  implementation of Unity's native NavMesh/door physics.
- [x] Rebuilt desktop package; inspected the actual desktop `.lnk` target,
  empty arguments and repository working directory. All paths exist. Shell
  launch opened `Untitled map — Revola Map Drawer` (fresh PID 17780), then only
  that fresh process was closed. Generated/confirmation screenshots inspected.
- [x] Native Windows x64 game build finishes with zero errors. Its visible player
  probe passes create/save/launch, direct Esc editing, save/relaunch, generated
  NPC/loadout/patrol import and return to the hub, plus right-stick cursor,
  left-stick pan, four inverse pan deltas and ignored ZoomIn/ZoomOut actions.
  `Builds/DrawerPlacementValidation/proof/result.json` in the companion checkout
  reports `passed: true`; editor/pan screenshots were inspected. Input was
  synthetic; physical-controller feel is not independently certified.
- [x] Full 39-file vendored snapshot/provenance, Jint exporter, packaged game
  renderer and prepared resources are current. Game renderer fingerprint:
  `3539d4f182829bab29afdd8b876b94fe8e8fdb572d1a48d678d9ab85c7ddd5e1`.
  Test-only Unity sources were removed and the isolated Steam source restored
  byte-for-byte; the main checkout's Steam source was never changed.
- The Electron module-not-found screenshot came from the new smoke harness's
  trailing directory separator escaping its closing Windows argument quote.
  Resolving the root path fixes it; all final source launches pass. The normal
  packaged shortcut and desktop/web file buttons retain their existing behavior.

## Integrated controller text and menu navigation — 2026-10-23

- [x] Swap the game's sticks: right stick cursor, left stick scroll/zoom. Retain
  Action/Attack click/drag, the owner's inverted D-pad pan and ignored ZoomIn/Out.
- [x] Game-only DOM caret blinks at the map-name/keyboard insertion point without
  native OS focus. Smoke checks real transmitted BGRA pixels across blink phases.
- [x] Reliable controller keyboard opens after the complete field click, including
  an already-focused field and mouse-to-controller handoff. QWERTY/numeric layouts,
  Shift, Space, insertion arrows, backspace, Clear, Cancel and Done; respect selection
  and maximum length, commit only on Done, avoid reopening on focus restoration.
- [x] Source/packaged game smoke covers mid-string insertion, deletion, case,
  reopening, cancellation, Save as, numeric input and switching to physical
  keyboard typing inside the preview. Screenshots under ignored
  `artifacts/game-keyboard*.png` and `game-map-name-caret.png` were inspected.
- [x] Companion Test maps navigation follows horizontal actions and neighboring
  rows, remembers the column through full-width maps, skips disabled actions,
  reveals scrolled selections and has no edge wrap. Covers Add maps, Remove maps,
  removal confirmation and instructions; physical D-pad joins left-stick/arrows.
- [x] 354 unit checks and full UI/packaged suites pass. Both source/packaged game
  smoke pass. Companion Unity verifies all 21 targeted cases across the initial
  20 passing cases and the corrected navigation fixture retry (1/1); the two
  fixture fixes shortened a Windows path and used reference identity for rows.
- [x] Both offline packages and complete 36-file Unity snapshot/provenance are
  current; exporter rebuilt. The maintained desktop shortcut was inspected and
  launched to the current packaged UI, then only that fresh process was closed.
- [x] Native Windows build: zero errors; the final current renderer package also
  passes the player's complete create/save/launch/pause/edit/relaunch/return probe,
  right-stick cursor, left-stick zoom, inverted pan and keyboard open/Escape/reopen
  on the same field. `Builds/DrawerControlsValidation/proof/result.json` in the
  companion checkout reports `passed: true`. The in-game keyboard screenshot was
  inspected. All test-only sources/Steam changes were removed/restored.
- No schema, geometry, generation, desktop/web file-button or save-format change.
  Physical-controller feel is not certified by synthetic input checks.

## D-pad direction preference — 2026-10-23

- [x] Invert both D-pad axes in Unity's input conversion: view moves toward the
  pressed direction and map content moves opposite. Speed, diagonal normalization,
  mouse/RB dragging, cursor and right-stick zoom remain unchanged.
- [x] Companion runtime/producer need no matching change: pan packets still carry
  the same CSS-pixel camera deltas. Update controls documentation only; the existing
  desktop package/shortcut was inspected and launched successfully.
- [x] Updated four-direction Unity regression passes (including scaling and diagonals):
  companion `Library/RevolaMapManager/DrawerDpadInverseValidation/results.xml`.

## Integrated controller D-pad pan — 2026-10-23

- [x] Remove the ZoomIn/ZoomOut command path from Unity, host and preload.
  Mouse wheel/right-stick wheel zoom and the canvas zoom controls remain.
- [x] Physical D-pad directions continuously pan in screen space, using unscaled
  time and equal diagonal speed. Prefer the assigned player's Rewired gamepad
  template, with Unity Input System fallback; gameplay bindings remain unchanged.
  Cursor position and project contents stay fixed; modal dialogs block canvas pan.
- [x] Game hints and both projects' current controls documentation now describe
  D-pad pan. The frontend pan matches the pixels of an equivalent middle-button
  drag, returns exactly with the opposite delta and preserves zoom.
- [x] 354 unit cases, full UI/packaged suites and source/packaged game smoke pass.
  Companion Unity: 17/18 passed initially; the pre-existing atomic replacement
  test hit a Windows file lock and passed its isolated retry. All 18 cases are
  verified across those runs; no unrelated store implementation change.
- [x] Rebuilt both packages, snapshot/provenance/exporter, inspected and launched
  the maintained desktop shortcut to the current packaged editor.
- [x] Native Windows player build has zero errors; probe passes all four pan
  directions, exact inverse pan, fixed cursor, ignored ZoomIn/ZoomOut,
  right-stick zoom and create/edit/save/launch/return. Companion proof:
  `Builds/DrawerDpadValidation/proof/result.json` (`passed: true`), with screenshots.
- Physical-controller feel is not certified by the synthetic input checks.

## Integrated editor aspect and performance — 2026-10-23

- [x] Owner-confirmed baseline committed/pushed to main: Drawer `d1e1528`,
  companion Revola `2040cdb7`. The following fixes are local working changes.
- [x] Preserve aspect with a single viewport scale. Game host no longer raises
  individual axes to independent minimums; normal, ultrawide and portrait test
  sizes reach the renderer/frame transport unchanged.
- [x] Cache unchanged game architecture at full viewport resolution. Hover and
  live overlays reuse it; geometry, grid, zoom, pan, resize and floor readiness
  invalidate it. Source/packaged game smoke verifies grid/mirror round trips.
- [x] Read-only 56-wall benchmark: identical initial canvas SHA-256 before/after.
  For the same 180 pointer moves, renderer CPU time fell from 1.526 s to 0.533 s
  (about 65%); delivery remained about 29 fps under the unchanged 30 fps cap.
  Idle generated zero bitmap frames over two seconds in both versions. Evidence:
  `artifacts/game-performance-before.json` and `game-performance-after.json`;
  repeat with `node scripts/game-performance.mjs --project=PATH --label=NAME`.
- [x] Companion suppresses covered-world culling, depth and postprocessing work,
  keeps Camera.main accessible, uses 60 fps for input/cursor, and restores exact
  original states. Native comparison: Unity CPU 2.031 s → 0.656 s over 2.5 s;
  hidden world/postprocessing cameras 1 → 0, frame loop 240 → 60 fps.
- [x] Eliminate the second full BGRA payload allocation/copy in Unity's reader.
  Wire format and texture resolution remain unchanged.
- [x] 354 unit cases, full UI/packaged suites, source/packaged game smoke and
  17 companion Unity cases pass. Desktop/web file actions remain unchanged;
  edition-only save customization is explicit in AGENTS.md.
- [x] Rebuilt desktop/game packages and snapshot/provenance/exporter. Inspected
  and launched the actual desktop shortcut to its current packaged editor.
- [x] Final native Windows create/edit/launch/return probe passes. Screenshots
  confirm 3440 × 1440, 1920 × 1080 and 1440 × 1080 without distortion, including
  live resizes. Companion proof: `Builds/DrawerOptimizedValidation/proof/result.json`
  (`passed: true`), with `performance.json` and screenshots alongside it.
- These are local short measurements, not a hardware-independent fan/noise
  guarantee. Physical controller feel and non-Windows platforms remain untested.

## Integrated editor follow-up — 2026-10-23

- [x] Companion Unity accepts raw mouse scroll from either input API, normalizes
  legacy notches to Electron units and avoids duplicate delivery. A wheel is
  processed on the first frame after controller navigation. Rewired ZoomIn and
  ZoomOut address canvas zoom, with unscaled held-button repeat.
- [x] Esc > Edit current map opens the source directly. Save and launch reuses
  the emphasized Save all button style; Unity displays a centered progress bar
  before conversion and retains it through generation and scene startup.
- [x] `npm test`: 354/354; full `test:ui`, `test:packaged` and source/packaged
  `test:game` pass. Game smoke checks both wheel directions, input-mode changes,
  explicit zoom commands and the emphasized launch button.
- [x] Companion Unity: 20/20 cases pass, including both mouse API paths,
  duplicate-notch suppression, direct Esc edit and progress lifetime. XML/log:
  `Library/RevolaMapManager/DrawerFollowupValidation` in the companion checkout.
- [x] Final Windows x64 build: zero errors. Visible player probe passes direct
  edit, launch feedback, failed-save recovery, Rewired zoom, revised-map launch
  and return hub. Screenshots verify the centered progress bar, emphasized launch
  button and zoom changing from 8% to 9%. Companion proof:
  `Builds/DrawerFollowupFinal/proof/result.json` (`passed: true`). An initial probe
  checked overlay disposal before Unity's next Update; the final probe waits for
  disposal after Ready. Production behavior did not require an additional change.
- [x] Rebuilt desktop package and game snapshot/provenance/exporter. Verified
  the actual desktop shortcut's target, empty arguments and working directory,
  launched it to `Untitled map — Revola Map Drawer`, and closed that fresh instance.
- Physical controller feel remains unverified; binding and cursor checks use
  automated input. No format, geometry, object schema, version or release change.


## Integrated Revola game edition — 2026-10-23

- [x] Add a game-specific, offline offscreen host. Its hidden renderer supplies
  BGRA frames and receives input from the game's Canvas; no separate visible
  Drawer window, browser installation or development server is required.
- [x] Preserve desktop/web file exports. Game mode offers Save, Save as,
  Save and launch and Show in explorer, plus source selection and dirty-close
  confirmation. Startup disables editing until the selected source has loaded.
- [x] Controller cursor: radial dead zone, unscaled movement, Action/Attack held
  click/drag, right-stick scroll/zoom, RB pan, Utility back, DOM dropdowns and
  on-screen text/number entry. Mouse/keyboard can take over normally.
- [x] Game sources, draft saves, immutable cached revisions, generated results,
  ZIP/PNG-source editing and return hubs use the companion's existing user-map
  system. Preserve old source formats and geometry/object/patrol behavior.
- [x] Companion synchronization vendors 35 runtime files, canonical LF hashes,
  source commit/dirty provenance and pinned Electron version. Rebuild both the
  Jint producer and fingerprinted offline package; refresh Unity build resources.
- [x] Add machine-local release instructions: update the sibling Revola checkout,
  verify its Windows edition and commit/push matching main changes during an
  authorized release update. No version bump, commit, tag or push in this task.
- [x] `npm test`: 354/354 pass. `npm run test:ui`, full `test:packaged`, native
  desktop save/reopen smoke and web build/offline smoke pass. Game smoke passes
  from source and the current packaged executable, including actual forwarded
  mouse/key events, save failure/dirty preservation, Save as, launch, source
  picker, DOM dropdowns, controller text entry and zero visible editor windows.
- [x] Unity: 19/19 targeted native cases pass in the isolated validation checkout,
  including create → launch → pause → edit current → controller hold/movement
  → launch revised source, legacy import/store behavior, menu regressions and
  build-resource preparation. Runtime-generation code/schema remain compatible.
- [x] Final Windows x64 Mono player build succeeded with zero errors. Its visible
  self-running probe completed create/save/launch/pause/edit/relaunch/return;
  screenshots show the empty ship canvas, the reopened 56-wall/9-door source and
  the Test maps menu inside the game window. Proof: companion
  `Builds/EmbeddedDrawerVerified/proof/result.json` (`passed: true`).
- [x] Rebuilt the current desktop package, verified the exact shortcut target,
  empty arguments, repository working directory and referenced paths. Launched
  the actual `.lnk` to `Untitled map — Revola Map Drawer`, then closed only that
  fresh test instance. Final source/packaged game smoke and 354 unit cases pass.
- Physical controller feel, non-Windows players and touch input are not
  certified by synthetic input/Windows x64 tests.
## Commit checkpoint — 2026-10-22

- [x] Owner authorized committing and pushing the manual patrol feature and
  companion-repository documentation to both **main** branches. Fresh fetches
  confirmed both branches matched origin/main before these commits.
- [x] Commit the feature separately from maintenance instructions: Drawer
  `59fbfa31c6eab3c3527ab152532f7f4efb79c313`, Unity
  `043ee0823e8efebc6ee9acefc833de1a76f53dc9`. Unity provenance now identifies that
  exact Drawer commit. All 12 vendored module hashes verify; contents match the
  recorded source after accounting for Windows/Git line-ending differences.
- [x] The previously verified runtime code is unchanged by commit preparation;
  the 31 distinct native Unity cases retain passing latest results. Packaged
  runtime bytes still match current source (30 files/34 entries). Shortcut
  read-back confirms the direct executable, empty arguments, repository working
  directory and existing paths. Launched the actual `.lnk` again and observed the
  working packaged editor through Computer Use. Source/UI/package/offline evidence remains in
  the manual-patrol milestone below.

## Companion repository maintenance instructions — 2026-10-22

- [x] Add prominent reciprocal instructions to both repositories' root `AGENTS.md`,
  including canonical GitHub repositories and this computer's exact local checkouts:
  `C:\Users\samin\Desktop\RevolaMapDrawer` and `C:\Users\samin\Desktop\Revola`.
- [x] Document the integration in Drawer README/design and Unity Map Manager/runtime
  documentation. Require assessing the companion project, making necessary matching
  changes and explaining when the existing counterpart remains compatible. Cover
  editor/runtime generation, metadata/geometry, authored NPC routes, catalogs,
  defaults/previews and the vendored producer/resource refresh process.
- [x] Verify local directories, referenced integration files and both configured
  Git origins; check both agent guides and integration references contain both
  machine-specific paths. `git diff --check` passes in both repositories.
- [x] This follow-up changes documentation only, so no runtime counterpart changes
  or new geometry/UI suites were needed. Existing packaged runtime bytes still
  match current source (`--verify-package`: 30 files/34 entries). Read back the actual
  desktop shortcut, confirm direct target/empty arguments/working directory and
  existing paths, launch the exact `.lnk`, and observe the working packaged editor
  through Computer Use. A package rebuild was unnecessary for these excluded docs.

## Manual NPC patrol routes — local unreleased continuation, 2026-10-22

- [x] Add **Patrol points (manual)** to NPC Advanced setup. Ask for 1–128 points,
  then collect that many playable-floor clicks in order. Show numbered markers
  only while configuring; hide them after completion or cancellation.
- [x] **Reconfigure route** repeats both steps. Commit a complete route and the
  draft advanced settings as one history operation. Escape/tool changes discard
  the draft and retain the previous route/settings. Automatic/default states
  remove the manual route when saved; old projects remain automatic.
- [x] Preserve ordered absolute source-pixel `patrolPoints` in projects and PNG
  metadata, through centered expansion and reopen. Bound and reconstruct the
  data independently in Drawer and Unity. SVG output and architecture PNG IDAT
  bytes remain unchanged, including during route use.
- [x] `npm test`: **354/354** pass. Full `npm run test:ui` and
  `npm run test:packaged` pass. Source/packaged object workflows cover count
  validation, an invalid floor click, ordered placement, visible numbered markers,
  immediate marker removal, single-step undo/redo, canceled/repeated configuration,
  one-point routes, state changes, native save/reopen and unchanged PNG artwork.
  Evidence: ignored `artifacts/manual-patrol-*.log` and
  `artifacts/objects*/manual-patrol-placing.png` (visually inspected).
- [x] `npm run test:web` rebuilds and passes the real browser offline workflow:
  place an NPC, configure two ordered patrol points, download and reopen the
  project exactly. No uploads or third-party requests. Evidence:
  `artifacts/manual-patrol-web.log` and `artifacts/web-results.json`.
- [x] Runtime/Editor compilation: **0/0 errors**. Unity 2022.3.62f3 has **31
  distinct passing cases** using each case's latest result: parser bounds/order,
  real editor prefab application for one/three points, unreachable-point rejection,
  unchanged automatic categories/routes and a real runtime scene activation with
  one/three-point plan save/reopen and first-target index 0. Initial cohort 29/31;
  the invalid-route test expected a preview result instead of the existing thrown
  exception, and the automatic-category regression hit a transient Windows
  `File.Replace` failure. Corrected that test expectation; focused rerun **2/2,
  exit 0**, including the unchanged category regression. Evidence: sibling game's
  ignored `Library/RevolaMapManager/Validation/manual-npc-patrol*.xml/.log` and
  exit/Steam-guard records. Clone-only Steam seam restored; real saves untouched.
  Updated the bundled producer and runtime resources to the tested source.
- [x] Rebuild the Windows package. Postpackage refresh and explicit `-VerifyOnly`
  confirm the actual desktop shortcut's direct executable, empty arguments,
  repository working directory and existing paths. Launch that exact `.lnk` and
  observe the working packaged UI through Computer Use. Packaged tests compare
  maintained runtime source bytes; the newest test build remains open.

Routes are loops with zero waits and begin at point 1; a single-point route is
supported. Unity validates character footprints and native static paths, including
the return to point 1, and reserves targets before automatic props. Authored dynamic
obstacles retain the game's ordinary avoidance behavior. Manual routes are not
silently replaced if invalid. Physical movement through every user-authored route
and a new standalone player build are outside this milestone's verification.
No new version, release or Vercel deployment was requested. Commits and pushes
were subsequently authorized; see the commit checkpoint above.

## Version 0.14.0 release preparation — 2026-10-22

- [x] Owner requested commits/pushes for both repositories, a Drawer release and
  a Vercel production update. Selected feature version **0.14.0**; package,
  lockfile and dated changelog agree. Earlier local milestones below are included.
- [x] `scripts/build-release.ps1 -Version 0.14.0` passed all **353** unit tests,
  the full source UI suite, package verification and the full packaged UI suite.
  The verified portable ZIP contains 34 entries/30 runtime files. Its extracted
  application saved and reopened the exact graph offline with zero renderer
  errors and zero network requests. Evidence: ignored
  `artifacts/release-0.14.0-preparation.log` and `artifacts/release/v0.14.0/`.
- [x] Browser checks now rebuild current source before testing. Actual 0.14.0
  local/offline tests pass, including all ten shop weapon names and all door
  choices; first-load body is 70,192 bytes and warm open needs no host requests.
- [x] Postpackage refreshed the desktop shortcut. Explicit `-VerifyOnly` confirmed
  the direct current packaged executable, empty arguments, repository working
  directory and existing paths. Launched the actual `.lnk` through Windows Shell;
  Computer Use observed the working packaged editor and its gameplay toolbar.
- [x] Commit and push both main branches: Drawer
  `9177678af1449df9692b12178941d9f8eeb28c33`, companion Unity integration
  `9d6ba09f40e3c3a5dc0622c8df71b5ff26b37753`. Unity's vendored producer provenance
  points to this exact Drawer source. Both main branches match their remotes.
- [x] Create/push immutable annotated tag **v0.14.0** at the Drawer source commit.
  GitHub [application verification](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39780764013)
  and [release build](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39781403272)
  both pass, including the extracted portable application's offline verification.
- [x] Download the CI draft's ZIP and checksum and verify SHA-256 against both
  `SHA256SUMS.txt` and GitHub's asset digest. Published
  [v0.14.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.14.0)
  at **2026-10-22 12:56:43 UTC**; API confirms latest release, not draft/prerelease,
  with exactly the portable ZIP and checksum. ZIP: **162,734,196 bytes**, SHA-256
  `e44e5ee896c92f6183dde80505bbec3e2827ef5dcf1ae6b986270305622eafc2`.
- [x] Deploy the same source to [Vercel production](https://revolamapdrawer.vercel.app),
  deployment `dpl_8ai6oKuSUnrsrZVvN5JtxwsfEB8c`, build ID **5ba507a64ba0d31b**.
  `npm run test:web -- --url https://revolamapdrawer.vercel.app` passes the real
  production palettes, native browser downloads/reopen, cached/offline reload,
  floor exports, cache/security headers and absence of map uploads/third-party
  requests. Zero renderer errors. Downloaded production service worker exactly
  matches the verified local 0.14.0 build (SHA-256
  `8f53442a8865bd778258da7ff9a883670a4f822455d1b3cc3abd32a63fe7df62`).
- [x] After the final tag build, read back and launch the actual desktop shortcut
  again. Computer Use observed all three door choices and selected **Hinged door**
  in the working packaged editor. The current build is left available for testing.

The final publication record changes documentation only; the release tag remains
on the verified feature commit. Gameplay/geometry limitations recorded below
still apply. The companion Unity integration was committed/pushed; no new full
game distribution was requested or published.

## Door snapping previews and explicit hinged doors — local unreleased continuation, 2026-10-22

- [x] Show an aperture-aligned green DOOR SNAP highlight and translucent selected
  door vector while hovering or dragging a gameplay door. Red OCCUPIED previews
  prevent duplicate placement. Clear the preview on pointer leave/tool changes;
  preview data never enters saved projects or architecture exports.
- [x] Offer Automatic door type, Sliding door and Hinged door. Old `auto` records
  remain valid; `sliding` and `hinged` persist through save/reopen and history.
  Add a traced monochrome closed-leaf vector from the canonical RevolaDoorA
  prefab; there are now **24** maintained gameplay vectors.
- [x] Shared editor/runtime door planning respects explicit types while retaining
  continuous sweep/pocket/passage certification. Failed explicit types leave an
  open gap with reasons. When authored doors exist, only their openings enter
  planning, so unselected openings cannot reserve competing invisible sweeps.
- [x] `npm test`: **353/353** pass. Full source and packaged UI suites and browser
  offline tests pass. The extended object workflow also verifies real preview
  pixels, pointer-leave clearing, occupied rejection, type changes, dragging to a
  ship opening, undo and unchanged architecture PNG IDAT bytes. Evidence: ignored
  `artifacts/door-objects-*.log`, `artifacts/objects*/door-snap.png` and
  `artifacts/objects*/door-drag-snap.png`.
- [x] Unity 2022.3.62f3: **27/27** pass. Coverage includes explicit-kind selection
  and no fallback, real editor prefab placement for both types, omission of
  unselected overlapping openings, legacy auto parsing, existing door safety
  regressions and runtime generation/saved-plan reopen with an explicit slide.
  XML/logs: sibling game's ignored `Library/RevolaMapManager/DoorObjectsValidation`.
- [x] Rebuild the Windows package and run `test:packaged`. Shortcut postpackage
  refresh and explicit `-VerifyOnly` confirm the direct executable, no arguments,
  repository working directory and existing paths. Launch the actual desktop
  `.lnk`, observe all three door choices, and select Hinged door in the packaged
  UI. Package verification checks the current runtime source bytes.
- [x] Independent Windows x64 Mono build succeeded with **0 errors**. The player
  imported the Drawer-saved fixture twice, generated exactly one requested
  Sliding/Hinged door in each case, and reopened both saved plans unchanged.
  It activated the final map with the real KamaraDoorScr hinged prefab enabled
  and its certified maximum angle **180°**. Proof: sibling game's ignored
  `DoorObjectsValidation/native-player-proof.json` reports `passed:true`,
  `activated:true`, `editor:false`. This headless run verifies generation and
  activation; it does not certify GPU output or a played doorway crossing.

No version/tag change, commit, push, release or deployment was requested.

## Shop weapon catalog synchronization — local unreleased continuation, 2026-10-22

- [x] Replace the hand-maintained eight-weapon palette with the **10** sellable
  weapons from the union of both canonical shop prefabs and new managed weapon
  sale flags. Exclude owned-only rows and per-scene random availability. English
  labels use the same localization keys as the shops, with definition fallback.
- [x] Add **Ravager Assault Gun** and **LAF Laser Rifle** to ground spawns, crate
  loot and NPC loadouts. Update all existing weapon names, including S7 Suppressed
  Pistol, S44 Ricochet Shotgun, Storm Rocket Launcher, Uzi model C14, Dragonslayer
  Railgun, Plainsteel Sword, Ashigaru Katana and S66 Ricochet Pistol.
- [x] Add their traced monochrome vectors, bringing the maintained total to **23**.
  Catalog/source hashes are recorded alongside SVG provenance. All new object
  data still stays out of exported architecture pixels/SVG; old keys still load.
- [x] Use one generated `src/weapon-catalog.js` for all Drawer choices; NPC choices
  and default melee/ranged pools respect NPC eligibility. Unity imports canonical
  prefab paths and resolves inventory item IDs through a trusted packaged catalog,
  supporting new managed prefabs rather than a fixed eleven-prefab list.
- [x] Normal Unity build preparation refreshes `RevolaMapDrawerWeapons.json` from
  the shops. The maintained visual exporter/tracer synchronizes the offline Drawer
  catalog, names and previews together. Future shop changes require this refresh
  and rebuilding Drawer; no runtime game-folder or network dependency was added.
- [x] `npm test`: **352/352** pass. Full `npm run test:ui`,
  `npm run test:packaged` and `npm run test:web` pass. UI regressions compare all
  three complete lists, save the two newer weapons in pickup/loot/NPC roles and
  reopen them unchanged. PNG architecture IDAT bytes stay identical.
- [x] Unity 2022.3.62f3: **13/13** pass. Native tests compare the packaged catalog
  to current shops/English labels, resolve all ten weapons, equip both newer NPC
  weapons in editor population, test implicit melee/ranged pools and generate/
  reopen runtime plans containing the newer pickups and crate contents.
- [x] Windows package rebuilt. Automatic shortcut refresh and explicit read-back
  confirm the direct packaged executable target, empty arguments and repository
  working directory; all paths exist. Launched the actual desktop `.lnk` and
  observed its Weapon spawn dialog containing exactly the ten shop names above.
  Runtime source bytes are checked by package verification. Evidence: ignored
  `artifacts/shop-catalog-*.log`, `artifacts/objects*/shop-catalog.revola` and
  `artifacts/objects*/editor.png`; Unity XML/logs under the sibling game's ignored
  `Library/RevolaMapManager/ShopCatalogValidation/`.
- [x] Independent Windows x64 Mono verification build: **Succeeded, 0 errors**.
  The native player imported the actual Drawer-saved `shop-catalog.revola`,
  generated and reopened three scenarios unchanged, then activated the real map.
  It verified the Ravager Assault Gun ground pickup, an inactive LAF Laser Rifle
  loot object wired to the crate's destruction activators, and a live NPC equipped
  with LAF Laser Rifle (inventory **26**, item **10259**). Proof:
  `ShopCatalogValidation/native-player-proof.json` records `passed:true`,
  `activated:true`, `editor:false`. Headless validation covers generation,
  activation and equip/loot wiring, not GPU output or a played combat encounter.

No version change, commit, push, publication or web deployment was requested.
Gunpowder pistol, Laser assault gun and Laser shotgun remain outside the current
sellable catalog; their old saved pickup/loot keys remain compatible.

## NPC loadouts and monochrome object vectors — local unreleased continuation, 2026-10-22

- [x] Add an optional NPC weapon to Advanced setup. Unset selects a random
  melee/ranged weapon; an explicit selection equips that weapon in editor and
  runtime generation and persists in saved plans. Partial controller overrides
  retain their existing default behavior.
- [x] Rename Laser pistol to Suppressed pistol. Remove Gunpowder pistol and,
  following the owner's clarification, Laser assault gun and Laser shotgun from
  all new weapon, crate-content and NPC weapon choices. Eight selectable weapons
  remain. Old saved pickup/loot placements still load; retired weapons use a
  suppressed-pistol preview fallback.
- [x] Trace **21** monochrome game visuals into pure SVG and matching Path2D
  paths: eight weapons, eight devices, crate, barrel, door and two NPC bodies.
  Source paths/hashes are recorded in `assets/object-vectors/provenance.json`.
  Colored legacy pixels are rejected by the maintained tracer. No original game
  raster is copied into the app. Artwork provenance is separately identified.
- [x] NPC previews choose male/female with a 50/50 threshold on placement and
  retain the choice through project/PNG reopen and history. The game independently
  selects its variant. Old NPC records remain unchanged and display male.
- [x] Advanced setup displays standard defaults in parentheses, read from the
  actual RevolaGladiatorGob prefab, including private serialized sound fields.
  General state lists the generator's random Standing / Random wander / Patrol.
  The dialog notes that custom generation profiles may differ.
- [x] `npm test`: **351/351** pass. Full `npm run test:ui`,
  `npm run test:packaged` and `npm run test:web` pass. Source/package object
  workflows verify explicit weapons, default labels, stable preview data,
  save/reopen, partial overrides and identical architecture PNG IDAT bytes.
  Browser repeat/offline loading passes with zero external/upload requests.
- [x] Real Unity 2022.3.62f3 cohort: **10/10** pass. It covers all eight explicit
  weapon mappings, rejected keys, editor-equipped explicit weapon, unset melee
  and ranged loadouts, category overrides and runtime saved-plan reopen.
  Root build preparation refreshed the trusted producer and current resources.
- [x] `npm run package` refreshed the desktop shortcut. `-VerifyOnly` read back
  the exact executable target, no arguments and repository working directory;
  referenced paths exist. The actual `.lnk` was launched, and the saved six-object
  project opened with six valid objects, new vector previews, Suppressed pistol
  and prefab default labels in Advanced setup. Package checks verify current
  runtime source bytes. Evidence: ignored `artifacts/npc-visual-*.log`,
  `artifacts/objects*/{editor,npc-advanced}.png`; native desktop observation used
  the shortcut's packaged executable after automated app tests finished.
- [x] Independent Windows x64 Mono verification build succeeded with **0 errors**.
  The player imported the Drawer-saved fixture, generated/reopened crate-only,
  NPC-only and all-category cases, then activated the real runtime scene.
  The live NPC equipped Suppressed pistol (inventory slot **16**, item **10252**)
  and retained health 25 and its partial overrides. The proof records
  `passed:true`, `activated:true`, `editor:false`. Evidence is under the sibling
  game's ignored `Library/RevolaMapManager/DrawerVisuals/native-player-proof.json`.
  The headless run verifies activation/equipping, not GPU rendering or combat.
- [x] Final door vector correction aligns the sliding leaf with the opening
  tangent. Repeated **351/351** unit checks and focused source/package object
  workflows pass after this visual-only correction; the package was rebuilt.
  Full source/package/browser suites passed before this final orientation fix.

Limitations: vectors are editor previews, with a 24-screen-pixel minimum visible
size when zoomed out, and are not collision footprints or game-gender predictions.
The legacy colored assault/shotgun assets are excluded from the new palette.
No release/version change, commit, push, web deployment or publication requested.

## Optional gameplay objects — local unreleased milestone, 2026-10-22

Implemented together with `C:\Users\samin\Desktop\Revola`. No new release version,
tag, publication, deployment, commit or push was requested for this milestone.

- [x] Add six tools below the architecture tools: NPC, door object, crate,
  explosive barrel, weapon spawn and device spawn. All fit the 1024 × 700 test
  window; the rail remains scrollable at smaller heights.
- [x] Type lists for melee/ranged NPCs, 11 weapons, 8 devices and crate contents;
  Empty is the first/default crate choice. Choose position then aim and click
  facing; doors snap directly to stable opening IDs, including ship doors.
- [x] Select individual objects, drag, aim rotation, Delete, undo/redo, and
  reopen editable project/PNG data. Hovering an NPC opens Advanced setup.
- [x] All 16 requested NPC fields are allowlisted and verified against actual
  TopDownNPCController fields, including the two private serialized fields.
  Missing fields inherit presets; explicit false/zero retain their meaning.
  Standing, random wander and generator-owned patrol routes are supported.
- [x] Shared editor/runtime category overrides: valid authored objects replace
  only their own category. Empty/absent/invalid-only categories stay automatic.
  Invalid floor/wall/ship-hole centers and centers less than 45 px apart are
  excluded; close wall/neighbor placement remains allowed.
- [x] Keep image artwork architecture-only. The actual PNG IDAT bytes are
  identical before/after six object placements; editable metadata retains them.
  SVG wall/floor output is also unchanged. Legacy project regressions pass.
- [x] Update Unity's trusted bundled producer, editor population, runtime
  generation/activation, persisted plans and separate authored prefab pool.
  Native build preparation refreshes canonical resources without changing
  automatic pickup pools. Reserve authored patrol targets before later props.

Verification:

- `npm test`: **348/348** pass, including five object schema/geometry/export
  regressions and the existing geometry, persistence, package and browser checks.
- Complete `npm run test:ui` passes; the new `npm run test:objects` also passes
  after the final floor-summary refresh correction. It drives native Electron
  controls, six placements, facing, door snapping, NPC hover/partial overrides,
  deletion, undo, native save/reopen and exact PNG pixel preservation.
  Extended focused source/package checks also verify dragging, changing a placed
  object's facing, undoing both, and independent next-placement versus selected-
  instance type choices. All of these checks pass on the final renderer.
- `npm run package` rebuilt the final source; complete `npm run test:packaged`
  passes, including the same object workflow and source-byte checks in app.asar.
  Evidence: ignored `objects-unit-final.log`, `objects-ui-suite.log`,
  `objects-package-final.log`, `objects-packaged-final.log`, `objects*/editor.png`.
- Real Unity 2022.3.62f3: initial editor/backward-import cohort **8/8**;
  current isolated editor + runtime cohort **7/7**, with crate-only, NPC-only and
  all-category plans exactly preserved through saved-plan reopen. Final alias/
  every-NPC-field cohort **5/5**. Runtime/editor private compilation also passed.
- Native Windows x64 Mono verification build: **Succeeded, 0 errors**.
  A player launched independently of Unity imported the actual Drawer-saved
  fixture, generated and reopened three cases: **29 placements / 1 authored /
  2 door plans** for crate-only, **13 / 1 / 2** for NPC-only, and **5 / 5 / 1**
  for all categories authored. It activated the final gameplay scene, found
  exactly one instance of each non-door category, confirmed NPC health **25**,
  `canSidestep=false`, two generated patrol points and no loot for the empty
  crate. The proof reports `editor:false`, `activated:true`, `passed:true`.
  Evidence is ignored under the sibling game's
  `Library/RevolaMapManager/AuthoredObjectsValidation/`; the native run used
  headless rendering and does not certify game visuals/combat.
- Desktop shortcut read-back verified its exact target
  `<repository>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty
  arguments and repository-root working directory; all paths exist. Launched
  the actual `.lnk` after the final rebuild. Computer Use observed the packaged
  `resources/app.asar/index.html`, all six tools and native Open of the saved
  six-object fixture; it displayed **6 valid / 0 excluded**. The editor is left
  open on this example. The machine-only shortcut remains outside Git.

Exact limitations: individual object selection only; wall clipboard/marquee
operations remain geometry-only. Editor symbols are abstract markers, not game
prefab previews. Center filtering intentionally permits physical prefab overlap
and tight wall placement; ordinary game collision/navigation handles those.
A door without a certified sweep stays open, and a patrol without a suitable
native route reports a generation error. Automatic categories can place zero
objects when their density/capacity requires it. Full combat, destruction/drop
animations for every catalog entry, rendered player visuals and non-Mono player
backends were not separately tested. The published website/release is unchanged;
this extension is available in the rebuilt local Windows test application.

## Attached-room overhang — version 0.13.1, 2026-10-22

The owner requested that both room tools extend beyond a host room's wall limits
when unobstructed, plus commit/push to `main`, an updated release and Vercel.
Version **0.13.1** is selected for this correction.

- [x] Allow clear overhangs past host corners with shared original junctions.
- [x] Verify both child/host types in all eight directions, new/existing doors,
  Shift square sizing and atomic collision rejection in focused geometry checks.
- [x] Verify complete geometry/persistence, source UI, browser and native delivery.
- [x] Inspect and launch the actual rebuilt desktop test shortcut.
- [x] Commit/push `main`, verify immutable v0.13.1 assets and update GitHub release.
- [x] Deploy and verify the same browser runtime in Vercel production.

Existing constraints remain: no unrelated boundary touches, wall intersections,
enclosed geometry, competing openings or protected ship/pin changes. The original
brief and reference images remain unchanged. Detailed verification follows below.

Verified source/browser preparation:

- `npm test`: **343/343** pass. New regressions cover both child and host types,
  all eight directions, new and reused doors, Shift square sizing, one-sided
  overhangs, exact shared corner vertices, JSON round trips, centered 16384
  expansion, fixed ship ports and atomic rejection of inward/outward obstacles.
- Complete `npm run test:ui` passes. Extended native room smoke checks draw
  **3000 px** rooms against **1600 px** hosts in all four type combinations,
  then verify one-step undo/redo and exact native save/reopen. Reviewed the
  actual resulting chamfered-room screenshot; the wider room joins both old
  corners without changing their geometry. Evidence: ignored overhang-ui.log,
  rectangular-room-overhang-*.png and rectangular-room-results.json.
- `npm run build:web` and `npm run test:web` pass final build **4dc738ed052b027c**,
  app **91ff1feeaa2ec15b**, seven files / **275,933 bytes**. First installation
  uses **50,562 Brotli body bytes** (66,881 gzip estimate). All four child/host
  overhang combinations have green previews, exact downloads/undo/redo/reopen
  and rejected outboard obstructions while offline: **zero host requests/bytes**.
  No uploads, third-party requests or renderer errors. Evidence: ignored
  web-results.json and web-overhang-*-preview.png.

Verified native release preparation and browser production:

- `scripts/create-release.ps1 -Version 0.13.1 -Push` passes its complete guarded
  build (`npm ci`, `npm test`, `npm run test:ui`, `npm run package`,
  `npm run test:packaged`, archive verification and extracted `test:portable`).
  All **23 runtime files** match current source; minimal manifest is 0.13.1.
  Every one of **77 ZIP files** matches the verified package. Extracted native
  offline save/reopen restores the exact **36-wall** fixture with zero network
  requests or renderer errors. Local ZIP: **158,079,158 bytes**, SHA-256
  `d6672db21795f1d8957280f8d6ed2fbf0b8e21b159cb28cbdfaf954f13f00143`.
  The immutable tag is **v0.13.1** on **b0feba7**, pushed after fresh clean-main,
  remote-main and packaged-byte checks. Evidence: ignored overhang-release.log.
- `postpackage` refreshes the actual desktop shortcut automatically. Separate
  `scripts/update-desktop-shortcut.ps1 -VerifyOnly` confirms its exact target
  `<repository>/dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe`, empty arguments,
  repository working directory and existing paths. Launched the actual `.lnk`
  through Windows Shell; Computer Use selected that exact executable, verified
  the visible offline editor/vector ship and selected Rectangular room. The
  untouched packaged editor is left open. The shortcut remains outside Git.
- Vercel deployment **dpl_BLBjGwFiPPtCn3hgBEgbnY4mrJ3v** is Production Ready,
  aliased to [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).
  All **seven** fetched production files match build **4dc738ed052b027c** by
  SHA-256, including application **91ff1feeaa2ec15b**. Real production browser
  smoke passes all four child/host overhang combinations, green previews,
  obstruction rejection, exact local save/reopen and undo/redo while offline.
  Those actions use **zero host requests/bytes**. Existing exports, offline
  floors, worker caching and no-upload checks pass without renderer errors.
  Evidence: ignored overhang-vercel-deploy.log, overhang-production-parity.json
  and web-production-results.json.
- GitHub main CI [39706501177](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39706501177)
  succeeds at exact implementation commit **b0feba7**, including geometry,
  native source UI, static browser/offline and packaged application checks.
- Tagged release CI [39706896187](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39706896187)
  succeeds, including the complete Windows build, archive verification and
  extracted portable save/reopen. Downloaded both actual draft assets and
  verified the ZIP against `SHA256SUMS.txt` and GitHub's asset digest:
  **162,699,922 bytes**, SHA-256
  `9964b43f7ebc0fe465da497d85f8a5609e78e8acbd8f1e0af0cfab4e9fa33fcd`.
  Release notes match the generated tagged source. Extracted the downloaded ZIP
  and checked its **23 runtime files**, manifest, license and notices against
  canonical `v0.13.1` Git bytes, independent of local Windows line endings.
  The maintained portable verifier passes exact **36-wall** native save/reopen
  with zero network requests/renderer errors. The maintained packaged room UI
  verifier also passes on that downloaded executable, including all four
  child/host overhang combinations, native reopen and one-step undo/redo.
  Evidence: ignored overhang-hosted-assets-evidence.json, overhang-hosted-portable.log,
  overhang-hosted-room-ui.log and release/v0.13.1/hosted-reviewed/.
- Reviewed notes/assets, removed the draft-only note and published requested
  [v0.13.1](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.13.1).
  GitHub confirms `draft=false`, `prerelease=false` and latest tag **v0.13.1**.
  Its immutable tag remains on **b0feba7**; repository visibility is unchanged.

## Rectangular rooms and vector ship — version 0.13.0, 2026-10-17

The owner requested four-corner rooms, simplified vector ship/airlock artwork,
commit/push to `main`, an updated release and Vercel production deployment.
Version **0.13.0** is selected for this feature milestone.

- [x] Add rectangular rooms with the existing room tool's free/attached behavior.
- [x] Replace ship rendering and wall SVG's embedded PNG with compact shared vectors.
- [x] Verify geometry/persistence, source UI, browser, native package and portable archive.
- [x] Inspect and launch the actual rebuilt desktop test shortcut.
- [x] Commit/push `main`, verify immutable v0.13.0 assets and publish the requested release.
- [x] Deploy and verify the same browser runtime in Vercel production.

Original reference PNGs, Finnish brief and the derived raster reference remain unchanged.
Verified preparation:

- `npm test`: **339/339** tests pass. Rectangular geometry covers free/rotated,
  attached, existing-door and corridor-mouth placement; minimum 450 px default-grid
  footprints prevent overlapping opposing walls. Existing chamfered behavior stays
  unchanged. Projects retain version 2 and ordinary editable graph edges.
- Dedicated source rectangular-room UI checks pass placement, live Shift changes,
  rotation, resizing, cancellation, exact native reopen and one-step undo/redo.
  Both ship facings preserve exact door center (4110.5,4700). All eight tools remain
  visible at 1008 by 661 content size. Evidence: ignored rectangular-room PNG/JSON.
- Ship/airlock use **144 points in five vector rings**. Actual native/browser SVGs
  are **10,760 / 10,772 bytes** for normal/mirrored test maps and **12,223 bytes**
  expanded, contain no image/data URL/external reference, and have **zero stable
  wall differences and zero isolated-ship pixel differences** against Canvas.
  Existing floor contour/barrier stays unchanged; <=1 px vector-edge probes verify
  full coverage inside its footprint plus the 12 px rim. Original reference and
  derived ship PNG bytes remain unchanged and are excluded from runtime packages.
- `npm run test:raster` passes 8192 and 16384 PNG export, white RGB, transparency,
  exact editable metadata, bounded stripe memory and zero stable interior/clear
  differences. Direct vector tessellation under stripe translation differs only
  at antialias edges: ship-only maximum 10/255 alpha and 12 seam pixels over 1/255
  (0.0231% of 52,000 sampled seam pixels, maximum 6/255). Its explicit limits are
  10/255 and 0.03%; ordinary wall limits remain 8/255 and 0.01%. Tight comparison
  crops remain unchanged. Evidence: ignored export-raster-results.json.
- `npm run test:airlock` passes measured 375 px openings, exact door-centered
  mirroring, white vectors, both facings, native persistence and history. Preview
  checks now respect the existing prohibition on saving during a gesture and
  verify exact cancellation before placement.
- Complete `npm run test:ui` and `npm run test:packaged` pass, including all
  rectangular-room checks and actual native Save all/export/reopen behavior.
  `npm run package` verifies **23 runtime files**, version 0.13.0 and current source
  bytes; `assets/ship.png` is absent from the application archive.
- Automatic `postpackage` refreshed the desktop shortcut. Separate `-VerifyOnly`
  readback confirms target `<repository>/dist/RevolaMapDrawer-win32-x64/RevolaMapDrawer.exe`,
  empty arguments, repository working directory and existing paths. Launched the
  actual `.lnk` through Windows Shell; Computer Use selected the exact packaged
  executable and visibly confirmed its vector ship, eight tools and active
  Rectangular room/Rotate 45 degrees controls. Closed the untouched verification
  window before the release rebuild. The shortcut remains outside Git.
- `npm run build:web` / `npm run test:web` pass build **1ce1148188de663f**, seven
  files and **275,880 total bytes**. First installation measures **50,575 Brotli
  response-body bytes** (66,857 gzip estimate); controlled reload and offline
  rectangular-room/modifier actions make zero host requests. No uploads,
  third-party requests or renderer errors. Worker update protection, exact local
  persistence, pure-vector SVG, floors and compact layout pass.

Release and deployment verification:

- `scripts/create-release.ps1 -Version 0.13.0 -Push` passes its complete local
  build and fresh clean-main checks, creates immutable `v0.13.0` on **78d1977**
  and pushes that tag. The wrapper verifies all **77 ZIP file contents** and an
  extracted offline native save/reopen of the exact **36-wall** graph, with zero
  renderer errors/network requests. Local ZIP: **162,699,904 bytes**, SHA-256
  `e3755666c796f7a685e050314c005cab49316cefed69fb7c7eed715af56b352e`.
- Main CI [39032318922](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39032318922)
  passes every source/native/web/package step at the exact implementation commit.
  Tagged release [39032583019](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/39032583019)
  also passes its complete native build, ZIP and extracted portable checks.
- Downloaded both actual GitHub draft assets and verified the ZIP against both
  `SHA256SUMS.txt` and GitHub's asset digest: **162,699,873 bytes**, SHA-256
  `5cae931b6aea8d854097c1ec7252e4c5348a411fa1241af1ba4e5dd62e8cb5a1`.
  Extracted the downloaded archive and ran the maintained portable verifier
  against canonical `v0.13.0` Git bytes (independent of machine line endings).
  All **23 runtime files**, minimal manifest and notices match. Native offline
  save/reopen restores exact **36-wall** geometry with zero network/renderer
  errors. Evidence: ignored rooms-vector-hosted-portable.log and hosted-reviewed/.
- Reviewed the two assets and release notes, removed the draft-only note and
  published the requested [v0.13.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.13.0).
  GitHub reports `draft=false`, `prerelease=false` and confirms this as latest.
  The immutable tag remains on **78d1977**; repository visibility is unchanged.
- Vercel deployment **dpl_CVEfxpqgLqp8Zxj5YeRkF3LswkLg** is Production Ready and
  aliased to [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).
  Production browser smoke and Save all checks pass. All **seven** fetched
  production files match local build **1ce1148188de663f** SHA-256 byte for byte,
  including app **75ea7265d07d1ca1**. Real production checks cover rectangular
  offline placement/history, exact local reopen, pure-vector SVG, all five Save
  all files, cached/offline floors and zero map uploads/third-party requests.
  Evidence: ignored rooms-vector-vercel-deploy.log, web-production-results.json,
  save-all-production-results.json and rooms-vector-production-parity.json.
- After the guarded release rebuild, repeated source/package parity and actual
  shortcut `-VerifyOnly` pass. Launched the real `.lnk` again and selected
  Rectangular room visibly; the untouched current packaged editor is left open.

Limitations: ship artwork is fixed and simplified, outside the editable graph.
Its legacy floor coverage is retained; the original hand-drawn raster edge noise
is intentionally absent. Broader existing branched-movement, detach/rejoin and
advanced corridor-route limitations remain unchanged.

## Floor, eraser and Save all feedback — version 0.12.0, 2026-10-14

The owner requested the three fixes, commit/push to `main`, a new GitHub release
and the Vercel production update. Version **0.12.0** is selected for this milestone.
The attached `Revolamap_a-source (2).revola` is a read-only private regression
fixture; it is excluded from the repository and distributions.

- [x] Correct floor closure for visible wall overlaps and verify the supplied map.
- [x] Remove erased terminal/junction skeletons and unused points, preserving exact visible geometry and old-project import.
- [x] Add and verify all five formats through Save all in Windows and the browser.
- [x] Run complete geometry, source UI, browser and packaged/portable verification.
- [x] Inspect and launch the actual rebuilt desktop test shortcut.
- [x] Commit/push `main`, create and verify immutable v0.12.0 release assets, then publish the authorized release.
- [x] Deploy and verify the same browser runtime in Vercel production.

Verified preparation:

Hosted preflight follow-up: main CI 38481354141 exposed an intermittent Save all
browser gesture check before tagging. Publication was held until the exact
pointer/gesture assertion was investigated and rerun; local checks remained valid.
The completed local tagging build was deliberately blocked by a tracked
checklist update; no local or remote v0.12.0 tag was created. The smoke helper
now waits for each tool's rendered frame, recalibrates/hit-tests each Canvas
press, and verifies its trusted pointerdown, capture and application status
before asserting all save buttons are disabled. Original logs lacked that event
evidence, so stale coordinates/focus timing is probable, not established as the
sole cause. Updated source/native/browser/private-map and packaged checks pass;
the correction changes the test script only and retains every save assertion.

- The private feedback map has **72 vertices, 75 walls, 8 doors**, no stored gaps,
  and centered **16384 × 16384** bounds. Three visible wall-face contacts miss
  their receiving centerlines by **2.8895 / 4.8543 / 4.8543 px**. Exact shared
  renderer polygons now close it without changing any saved coordinates.
  Native source/packaged floor checks show black floor and stars and export
  **696,727-byte PNG / 364,774-byte SVG** with transparent exterior and all
  **522,771** tested ship wall pixels covered. Original file SHA-256 remains
  **b1127a38259ff277215d427c6d2fc11c8294e96d9b1d47d7efc79ba9753c4fef**.
- `scripts/build-release.ps1 -Version 0.12.0`, with `REVOLA_FEEDBACK_FIXTURE`
  selecting that read-only map, passes **327/327** unit checks, complete
  `npm run test:ui`, automatic packaging/postpackage, complete
  `npm run test:packaged`, **23** exact runtime files/minimal manifest, portable
  ZIP byte comparison and extracted offline save/reopen. The extracted app
  reopens exact **36-wall** native project geometry with **zero network requests**
  and no renderer errors. New unit coverage includes **21 floor**, **15 eraser**
  and **15 Save all** tests. Source/packaged UI checks include actual erased-point
  removal/selection, one-step undo/redo, protected ship and 16384 editable PNG
  persistence. Baseline smoke pointer calibration now waits for rendered frames
  after Fit/moves to prevent a stale startup readout from misplacing test clicks.
  Evidence: ignored `artifacts/feedback-0120-preparation.log`, source/packaged
  floor/feedback/Save all JSON, screenshots and `portable-results.json`.
- Native Save all checks verify exact five-file names/content, confirmed dirty
  clearing, folder/overwrite cancellation, partial-install rollback, exclusive
  creation/restoration, blocked concurrent edits/saves/close and compact layout.
  Browser checks verify one ZIP with all five files and unchanged dirty reminders;
  the private 16384 map also produces exact source/PNG metadata and both SVGs.
  Synthetic 8192 PNGs are fully scanned for white/black pixels and transparency;
  private-map combined wall PNG is checked for CRCs, dimensions and exact editable
  metadata, without claiming a full wall raster scan.
- `npm run build:web` and `npm run test:web` pass the final browser build
  **377513203a5fbc1a**, app hash **58ccc385d4dd16cd**, eight files,
  **419,390 total bytes**. First install measures **198,225 response-body bytes**;
  controlled reload and offline drawing-modifier actions use **zero host requests**.
  Worker-update protection, local imports/downloads, exact persistence and compact
  layout pass, with no uploads, third-party requests or renderer errors. Evidence:
  ignored `feedback-0120-web-{build,local}.log`, `web-build.json`, `web-results.json`
  and `save-all-browser-results.json`.
- Automatic `postpackage` refreshed the real desktop shortcut. Separate
  `-VerifyOnly` readback checks direct target
  `<repository>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments,
  repository working directory and existing paths. Launched the actual `.lnk`
  through Windows Shell; Computer Use selected that exact executable and visibly
  verified **8192 × 8192**, **0 walls / 0 doors**, the fixed ship and new Save all
  control. Closed only this blank test instance before the tagging rebuild.
  `release:check --version 0.12.0 --verify-package` confirms all **23** runtime files.
  Evidence: ignored `feedback-0120-shortcut.json` and the actual UI observation.

Exact limits: floor analysis retains bounded spatial-check budgets; unsupported
density leaves floor/Save all disabled. Retained doors/interior gaps in isolated
compartments still reject exterior cuts. Once erasure removes a terminal/corner
and its old invisible envelope, an unreachable former compartment can become
indistinguishable from a detached appendage; that deleted envelope is not guessed.
Any ship-connected breach still prevents floors. Interior erasures retain gap
intervals, while trimmed ends and remaining incident corners retain optional v2
`cutEnds` markers; actual legacy solid slivers below joining tolerance keep their
original valid interval representation. A normal close cannot interrupt native
file installation; forced process/power interruption is not crash recovery.
Rollback conflicts preserve original `.bak` files and report the conflict.
Windows x64 remains unsigned. Browser checks cover desktop Chrome; application
caching does not save maps and updates wait for old tabs to close. Original
references, ship bytes/pins, world center and scale remain unchanged.

Verified publication and final handoff:

- Feature commit **4ee8e0c** and test calibration correction **e261086** are pushed
  directly to `main`. [Verify application 38482299541](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38482299541)
  succeeds for **e261086c6d3b0fb6faa60068091813c3f9dd1847**, including all
  **327** unit checks, source/browser UI, browser build, packaging and packaged
  UI. `scripts/create-release.ps1 -Version 0.12.0 -Push` repeated complete local
  verification from clean `main` matching fetched `origin/main`, then created
  immutable **v0.12.0** at that exact commit. Local/remote peeled tag readback
  agrees. [Build release 38483493179](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38483493179)
  succeeds, including ZIP compression, extracted offline persistence and draft
  creation. Evidence: ignored `feedback-0120-tagging-final.log`,
  `feedback-0120-main-ci-final.*` and `feedback-0120-release-ci.*`.
- Downloaded draft notes matched the reviewed generated notes. Exactly two
  assets matched the API sizes/digests: **162,834,906-byte** ZIP, SHA-256
  **4a1a3060b7d8c706edde958bd7fe6f37a999a66098f1308dba308bcc2745ae3a**,
  and **102-byte** checksum file. The maintained archive verifier compared every
  byte of all **77** ZIP files with the locally verified package. Published
  [v0.12.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.12.0)
  is public, non-prerelease and the explicit **latest**. Only the draft-pending
  sentence was removed from published notes. Anonymous public API/download
  readback returns **200**, and streaming both assets verifies the same complete
  sizes, SHA-256 values and checksum line. Evidence: ignored
  `feedback-0120-draft{,-api}.json`, `feedback-0120-hosted-archive.log`,
  `feedback-0120-published.json` and `feedback-0120-public-release.json`.
- Vercel production deployment **dpl_xQuJSLDdGSJoE8zHkNdv1bnzMCH2** is READY
  at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).
  Full production `npm run test:web -- --url ...` passes local downloads/reopen,
  floor images, offline cached use, worker protection, square rooms and short
  corridors, with no renderer errors/uploads/third-party requests. Save all also
  passes production with the private 16384 map under **1.5 DPR**, **4× CPU
  throttling** during gestures, and a viewport change between tools. Trusted
  Canvas press/capture/status and all save-disabled assertions pass. Original
  map bytes remain unchanged. Anonymous HTTP checks match all **eight** file
  hashes and root HTML to build **377513203a5fbc1a**, verify caching/security
  headers and require **404** for **17** private/native/source/original probes.
  Evidence: ignored `feedback-0120-vercel*.log`, `feedback-0120-web-production.log`,
  `feedback-0120-web-http.json`, `web-production-results.json` and
  `save-all-production-results.json`.
- After the final tagging rebuild, separate shortcut readback again verified
  the direct packaged executable, empty arguments, repository working directory
  and existing paths. Launched the actual `.lnk`; process readback confirms the
  expected executable with a responding **Untitled map — Revola Map Drawer**
  window. `release:check --version 0.12.0 --verify-package` again matches all
  **23** runtime files to current supported source. The user physically stopped
  Computer Use with Escape before final visual capture/private-map opening;
  no further UI automation was performed. Earlier visual verification of this
  unchanged runtime and full automated source/packaged/portable checks stand.
  All 77 downloaded ZIP file contents match that tested package byte-for-byte;
  an additional downloaded-copy UI launch was not performed after the stop. The test editor
  was left running; no user project was changed. Evidence: ignored
  `feedback-0120-shortcut-final.json` and `feedback-0120-shortcut-window.json`.

The final README/changelog/checklist follow-up changes documentation only;
verified native/web runtime and immutable version tag remain unchanged.

## Save filenames and release 0.11.1 — 2026-10-12

- [x] Verify Map name based `-walls`, `-floors` and `-source.revola` names in the shared native/browser save flow.
- [x] Verify new `.revola` project reopen and legacy `.revola.json` compatibility without a schema change.
- [x] Verify the complete Windows portable release and local/browser UI checks.
- [x] Inspect and launch the actual refreshed desktop test shortcut, confirming the latest packaged UI opens.
- [x] Commit/push directly to `main`, create immutable v0.11.1 and verify/publish its new release assets.
- [x] Deploy the verified browser build to Vercel production and verify live/offline downloads.

The owner requested source commit/push, a GitHub release update and the Vercel live update. Version **0.11.1** delivers this patch; published older versions and tags are preserved. Release and production deployment verification completed on **2026-10-12**.

Verified local preparation:

- `scripts/build-release.ps1 -Version 0.11.1` passes **289/289** unit checks, complete `npm run test:ui`, packaging/postpackage, complete `npm run test:packaged`, all **21** runtime byte comparisons/minimal manifest and every byte of **77** ZIP entries. The extracted portable app reopens the exact native-saved `.revola` project with **36 walls**, no renderer errors and **zero network requests**; its input fixture also verifies legacy `.revola.json`. Native tests assert exact dialog defaults for all five outputs, including `RevolaReserveMap-1-walls.png` / `.svg`, `RevolaReserveMap-1-floors.png` / `.svg` and `RevolaReserveMap-1-source.revola`, and the `.revola` project filter. Reopened projects are saved to distinct fresh outputs before whole-document comparison. Filename sanitization, PNG metadata, transparent images, dirty-state/cancellation/atomic-write protection, centered expansion, geometry/history and compact layout retain their checks. Evidence: ignored `artifacts/release-0111-preparation.log`, source/packaged smoke/SVG/floor/connection JSON and `portable-results.json`.
- `npm run build:web` and `npm run test:web` pass desktop Chrome local/offline use. Build **74a7b5166265f7d7**, app hash **7bf465d7ccad8cb5**, eight files, **413,421 total bytes**. Actual download events verify all five exact sample filenames; `.revola` and legacy `.revola.json` reopen with exact geometry. Floor PNG/SVG export works on the first offline closure without cached stars. Initial install measures **196,513 response-body bytes**, controlled reload makes **zero host requests**, and offline drawing uses **zero requests / zero bytes**; no uploads, third-party requests or renderer errors. Worker-update and 1024 × 700 checks pass. Evidence: ignored `artifacts/release-0111-web-build.log`, `release-0111-web-local.log`, `web-build.json` and `web-results.json`.
- The automatic `postpackage` hook refreshed the actual desktop shortcut. Separate `scripts/update-desktop-shortcut.ps1 -VerifyOnly` inspected its persisted direct target `<repository>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing target/icon paths. Launched that exact `.lnk` with Windows Shell; Computer Use selected the exact packaged process and visibly verified its clean **8192 × 8192**, **0 walls / 0 doors** editor, fixed ship and save controls at `resources/app.asar/index.html`. Closed only this new blank instance before the tagging rebuild. Evidence: ignored `artifacts/release-0111-shortcut.json` and the visible Computer Use observation.

Verified publication and final handoff:

- Source commit **f7e2477826d0de3ec84bdb7e546782c06ef6ffec** (`fix: add layer suffixes to saved map filenames`) was pushed directly to synchronized `main`. `scripts/create-release.ps1 -Version 0.11.1 -Push` repeated the complete local build/ZIP/extracted-app checks from clean `main` matching freshly fetched `origin/main`, then created immutable **v0.11.1** at that commit. Local/remote tag readback agrees. [Verify application 38240970867](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38240970867) and [Build release 38241274034](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38241274034) both succeed, including **289/289** unit checks and source/packaged UI. Main CI additionally passes the static browser build/UI; release CI passes compression, extracted offline persistence and actual draft creation. Evidence: ignored `artifacts/release-0111-tagging.log`, main/release CI logs and hosted run/readback JSON.
- The downloaded draft's notes matched the reviewed generated notes. Exactly two assets matched GitHub's sizes and digests: **162,829,163-byte** ZIP, SHA-256 **155c2ea0d68b10b7ac616159443a381551e1fac8290e4c94c634e186d3b22f0a**, and **102-byte** checksum. The maintained archive verifier compared every byte of all **77** files with the verified local package. Its downloaded/extracted app independently passes exact **36-wall** `.revola` native save/reopen and legacy import, all **21** runtime files/minimal manifest, no renderer errors and **zero network requests**. Published [v0.11.1](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.11.1) is public, non-prerelease and the explicit **latest**; only the reviewed draft-pending sentence was removed from final notes. Evidence: ignored `artifacts/release-0111-hosted-*`, `release-0111-published.json` and `release-0111-latest.json`.
- Vercel production deployment **dpl_EN832RNhiV4MVcVdge6YZynRXUjK** is READY at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app). `npm run test:web -- --url https://revolamapdrawer.vercel.app` passes all five exact sample filenames, new/legacy project reopen, transparent PNG/SVG and offline floor PNG/SVG, worker caching, square rooms and short corridors; no renderer errors, uploads or third-party requests. Anonymous HTTP checks match all **eight** deployed file hashes plus root HTML to build **74a7b5166265f7d7**, verify cache/security headers and require **404** for **26** private/native/source/original probes, including `.revola`. Evidence: ignored `artifacts/release-0111-vercel.log`, `release-0111-vercel-inspect.log`, `release-0111-web-production.log`, `web-production-results.json` and `release-0111-web-http.json`.
- After the final tagging rebuild, separate `-VerifyOnly` again checked the actual shortcut's exact direct target, empty arguments, repository working directory and existing paths. Launched the real `.lnk`; Computer Use selected the exact packaged executable and visibly verified the clean **8192 × 8192**, **0 walls / 0 doors** editor and fixed ship/save controls. `release:check --version 0.11.1 --verify-package` confirms the latest supported source in all **21** runtime files. This clean test editor is left open; no user map was opened or modified. Evidence: ignored `artifacts/release-0111-shortcut-final.json` and the final visible Computer Use observation. The final README/changelog/checklist follow-up changes documentation only; the verified native/web runtime is unchanged.

A final anonymous public readback returns **200** for both release downloads and the latest-release API. Streaming both public assets verifies the same exact sizes and SHA-256 values as the reviewed draft; latest metadata confirms **v0.11.1**, `draft=false`, `prerelease=false` and the same two asset digests. Evidence: ignored `artifacts/release-0111-public-http.json`.

Current limits: native dialogs suggest filenames and allow the user to choose another destination/name. Browser downloads cannot confirm destination/completion and retain unsaved reminders. `.revola` remains versioned JSON; SVG/floor images do not contain editable project data. Windows x64 remains unsigned; browser verification covers desktop Chrome, not mobile/touch or other browsers. Offline caching retains application files, not unsaved maps, and updates wait for old tabs to close. Original references, ship pixels/pins, world scale and document schema are unchanged.

## Version 0.11.0 release and web update — 2026-10-11

The owner's request authorizes committing/pushing `main`, updating the Windows release and deploying the web application. Version **0.11.0** is selected manually for the new room/corridor features and browser distribution. Older tags and releases remain unchanged.

- [x] Prepare matching package/lockfile/changelog metadata and verify the complete portable build.
- [x] Commit/push the verified source on `main`, create immutable v0.11.0 and verify hosted checks and draft assets.
- [x] Publish the verified v0.11.0 release as latest and check its downloadable assets.
- [x] Verify the new drawing behavior in desktop Chrome, deploy the web build and check production/offline behavior.
- [x] Inspect and launch the actual refreshed desktop test shortcut for the final handoff.

Preparation evidence: `scripts/build-release.ps1 -Version 0.11.0` passes source/packaged UI, all **21** runtime byte comparisons, minimal manifest, checksum and every byte of **77** ZIP files. The extracted portable application opens offline and saves/reopens exact editable geometry with **zero network requests**. After the Vercel guard was added, final `npm test` passes **289/289**, no skips. The real refreshed desktop shortcut's target/arguments/working directory/paths were inspected and its clean 8192 editor with new Shift Room guidance was visibly opened; only that blank test instance was closed before the tagging rebuild. Logs: ignored `artifacts/release-0110-preparation.log`, `release-0110-unit-final.log` and shortcut readback.

Local browser verification: build **4ce877f769893f3a**, app hash **31f9a354b05878df**, eight generated files, **413,387 total bytes**, measured first install **196,391 response-body bytes** and controlled reload **zero host requests**. Local/offline real Chrome verifies Shift square previews/placement/downloads, a **50 px** short corridor from an offset fixed doorway, exact graph/history and existing exports/reopen. Added drawing actions incur **zero requests / zero bytes**, with no uploads, third-party requests or renderer errors. The Vercel upload allowlist now explicitly includes `src/room-start.js`; its new test compares all transitive esbuild inputs with standard Gitignore semantics, checks excluded private/native/generated paths and reproduces the missing-module failure. Evidence: ignored web build/results JSON and `artifacts/release-0.11.0-web-build.log`, `release-0.11.0-web-test.log`.

Production web verification: Vercel deployment **dpl_EnGwtNCuv8aeLgGwLRYfKhtiJita** is READY at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app). Real Chrome production checks pass including Shift square rooms, the offset 50 px doorway corridor, exact downloadable/reopened geometry, exports and offline cached reload, with zero renderer errors, uploads or third-party requests. Anonymous HTTP checks compare all eight deployed file hashes with build **4ce877f769893f3a**, verify cache/security headers and confirm private/native/source probes return 404. Evidence: ignored `artifacts/release-0110-vercel-deploy.log`, `release-0110-web-production.log`, `web-production-results.json` and `release-0110-web-http.json`.

Hosted preflight correction: [Verify application run 38088408545](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38088408545) passed all 289 unit checks but exposed a short-corridor test viewport assumption. At 16% zoom the original high doorway fixture and real ship hull could not both fit the compact canvas; the pointer failed the test's visibility assertion before drawing. Only the smoke fixture changed: move the two synthetic high-zoom starts nearer the hull, then use real wheel zoom/middle-button pan fitted to measured canvas bounds. Exact lengths, screen-motion thresholds, topology, history and actual white hull pixel assertions remain. All six focused source/packaged normal/compact/compact-small commands pass, each with **87** screenshots and zero renderer errors. Normal canvas is **1094 × 708**; Electron's minimum window size clamps both compact requests to outer **1024 × 700**, content **1008 × 661**, canvas **715 × 448**. Hull minima are **2,398** normal and **725** compact white pixels. No tag was created by the interrupted preflight. Evidence: ignored `artifacts/connection-release-{source,packaged,compact-source,compact-packaged,compact-small-source,compact-small-packaged}.log` and matching results JSON. The complete clean-source rebuild subsequently passed before tagging.

Final release evidence: feature commit **ec30982** and compact-test correction **6ce7dc8** are pushed on `main`; immutable **v0.11.0** identifies **6ce7dc804624b1478bc3d0a2de781dbc125ad4e5**. `scripts/create-release.ps1 -Version 0.11.0 -Push` passed its full geometry/source UI/package/packaged UI/ZIP/extracted-portable checks and clean-source recheck. [Verify application 38088794287](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38088794287) and [Build release 38088966907](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38088966907) both succeed on that exact commit, including all **289** unit checks. Downloaded draft notes matched the reviewed generated notes exactly; both asset sizes/digests matched GitHub metadata, every byte of **77** hosted ZIP files matched the local verified package, and the downloaded/extracted app reopened a native-saved **36-wall** project exactly with zero renderer errors/network requests. Published [v0.11.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.11.0) is the public non-prerelease **latest**, with exactly ZIP and checksum assets. A second anonymous download verifies both public files and the **162,829,141-byte** ZIP's SHA-256 **8cccb1f195559e2db3e2d65af4367a1a4dea13b49b29be5b018d9f28874c8a0c**. Logs/readbacks remain ignored: `artifacts/release-0110-tagging-final.log`, main/release CI full logs, draft/latest JSON, hosted archive/portable logs and `release-0110-public-http.json`.

Final shortcut evidence: `postpackage` refreshed the real `<desktop>\RevolaMapDrawer - testattava versio.lnk`; separate `-VerifyOnly` inspected its persisted direct target `<repository>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing target/icon paths. Launched that actual `.lnk` with Windows Shell. Computer Use identified the exact packaged process and visibly verified the clean **8192 × 8192**, **0 walls / 0 doors** editor, fixed ship and new Shift/DOOR/END/CENTER Room guidance. Package checks confirm **0.11.0**, all **21** runtime source bytes and minimal manifest. Only this blank test instance was closed; no user map was opened or modified. Evidence: ignored `artifacts/release-0110-shortcut-final.json` and `release-0110-shortcut-final.png`.

Current limits: Windows x64 portable distribution is unsigned and has no automatic updater. Desktop Chrome production/offline behavior is verified; other browsers/mobile touch remain unverified. Browser updates wait for all old editor tabs to close; reopening online discovers the new build. Offline caching retains application files, not unsaved maps. Drawing limits remain those documented in the feature milestone below; original references, world scale, ship pins and saved schema are unchanged.

## Shift square rooms and short corridors — 2026-10-11

- [x] Commit the verified corridor continuation/attached-room work on `main`: `0392b10` (`feat: add corridor continuation and attached rooms`).
- [x] Hold Shift to keep Room width and depth equal, including rotated free rooms and exact attached door centers; update previews when Shift changes during a drag.
- [x] Remove the width-based 348 px corridor route filter so a short straight grid step can draw; retain safe bend geometry and click cancellation.
- [x] Verify geometry/persistence and source/packaged UI, rebuild and launch the actual refreshed desktop shortcut.

The feature work was subsequently committed/pushed on `main` as `ec30982` (`feat: add square rooms and short corridors for 0.11.0`). Publication evidence is recorded in the version 0.11.0 milestone above; the checks below describe its original local handoff.

Verified evidence and current limits:

- `npm test`: **288/288 pass**, no skips. Thirteen new geometry checks cover square free rooms in every quadrant with optional 45° rotation, attached square rooms in all eight directions, legal minima, exact centered **375 px** doors/IDs, rail junctions, atomic collisions and expansion. Short **25/75/150 px** straight corridors retain **580 px** separation, original graph junctions/openings, both ship facings and exact JSON reopen. Tight turns and reversals still reject atomically.
- `npm run test:ui` and `npm run test:packaged` pass the complete maintained suites without renderer errors. Both connection runs cover **87** screenshot states with actual ship hull pixels (minimum **2,398**), **15** attached room placements, two additional free square placements and seven short-corridor placements. Six Shift cases verify held-before-press, live keydown/keyup at a stationary pointer, held release, exact square dimensions, original door centers and one-step undo/redo; Shift+R still toggles rotation. Short free/door/END routes verify exact rails at **25/50/75/100/125 px**, positive previews and no terminal spurs. The one-grid-step free drag measures **3.75 screen pixels at 15% zoom**; the offset editable-door case measures **4 screen pixels at 16%**. A press 180 px along an editable opening, a press 100 px beside the ship opening and a single raw release exactly at its attracted anchor retain the intended normal displacement. Stationary attracted clicks and release back at the actual press make no edit. Native save/reopen and original obstruction checks also pass. Evidence: ignored `artifacts/square-short-unit-tests.log`, `square-short-ui-suite.log`, `square-short-packaged-suite.log`, connection results JSON and screenshots.
- Packaged screenshots were visually inspected for the rotated square preview, centered square room at an existing corridor mouth and one-grid-step doorway corridor. The live shortcut check below also confirmed visible short corridor placement.
- `npm run test:corridors` and `npm run test:corridor-end` pass the existing source start/end alignment checks. The raw-release fallback fixture independently accounts for its (-15,-35) start correction; receiving attraction still uses the raw release position, while direction-preserving fitting retains the exact start. Evidence: `artifacts/square-short-prior-corridors.log` and `square-short-prior-corridor-end.log`.
- `npm run package` rebuilt and verified all **21** runtime files and the minimal **0.10.4** manifest against current source. The `postpackage` hook refreshed the actual desktop `.lnk`; separate `-VerifyOnly` inspection confirmed the direct packaged executable, empty arguments, repository working directory and existing target/icon paths. Launched the real shortcut through Windows Shell. Computer Use observed the new Shift Room guidance and then an **8 screen-pixel** upward corridor drag at **16%** from the default outer DOOR: successful placement, **2 walls / 0 doors** and an **END** marker. Undo restored the clean **8192 × 8192**, **0 walls / 0 doors** map. Room remains active at 16%; no user map was opened or modified. Evidence: `artifacts/square-short-package.log` and `square-short-shortcut-corridor.png`.
- Limits: Shift equalizes the footprint's width/depth while keeping the fixed chamfer inset, rather than equalizing all eight chamfered edge lengths. Attached squares use the larger requested extent and legal doorway minimum, rounded up to twice the grid; existing collisions, host orientation and outward ship/corridor requirements remain enforced. Short straight corridor runs follow the document grid (default **25 px**), and drawing requires more than **3 screen pixels** of actual movement, so zoom in for the smallest pieces. Bends still require enough space for the fixed **580 px** corridor width; reversals, tight corners and self-overlap remain unsupported. Route attraction preserves the actual drag displacement from its exact anchored start. Original references, artwork, world scale, pins and saved schema remain unchanged.

## Attached room straight-drag correction — 2026-10-10

- [x] Reproduce the reported doorway/chamfer error on normal-only and tangent-only attached-room drags.
- [x] Give a missing dimension a usable default and show a legal minimum outline on early drags, preserving exact door centers and collision checks.
- [x] Require actual pointer movement before preview/placement so an attracted click cannot create a room.
- [x] Verify source/packaged UI, persistence, cancellation and history; rebuild and launch the actual refreshed desktop shortcut.

The previous attached-room checks exercised sufficiently large diagonal drags only. They did not verify the natural straight drags reported by the user. This correction adds that coverage.

Verified evidence and current limits:

- `npm test`: **275/275 pass**, no skips. Four added geometry checks cover normal-only and tangent-only sizing, early minimum outlines and small anchor offsets; centered doors and collision rejection remain checked.
- `npm run test:ui` and `npm run test:packaged` pass the complete maintained suites without renderer errors. Connection checks now cover **11** accepted room placements, including six natural straight drags from ship/corridor/wall/door starts. All **49** screenshot states per mode contain actual white ship pixels (minimum **2,398**). Exact centered **375 px** doors, original topology/pins, undo/redo, native save/reopen and collision rejection pass. An inaccurate stationary anchor click, Escape during an early **80 px** drag and release back at the original pointer press make no edit. Evidence: ignored `artifacts/room-drag-unit-tests.log`, `room-drag-ui-suite.log`, `room-drag-packaged-suite.log`, connection results JSON and screenshots.
- `npm run package` rebuilt and verified all **21** runtime files and the minimal **0.10.4** manifest against current source. The `postpackage` hook refreshed the real desktop shortcut; separate `-VerifyOnly` readback confirmed its direct packaged executable target, empty arguments, repository working directory and existing target/icon paths. Launched that actual `.lnk` through Windows Shell. Computer Use verified the new Room guidance and a straight vertical drag from the default outer airlock door: a centered square room was visibly placed with **8 walls / 1 door** and no error. Undo returned the test document to clean **0 walls / 0 doors**; Room remains active at **16%** zoom. Evidence: `artifacts/room-drag-package.log` and `room-drag-shortcut-room.png`.
- A missing drag component now follows the other dimension, subject to grid rounding and legal minima: default minimum width **900 px** at wall/door/ship starts or **1050 px** at corridor mouths, minimum depth **450 px**. Components within **75 map pixels** (or wall width when larger) count as absent to tolerate attraction offsets. For tangent-only editable-wall/door drags, the default side is up, or left for a vertical wall; drag diagonally toward the desired side to select another side. Ship and corridor rooms grow outward, and substantial inward drags remain rejected. Actual movement must exceed **3 screen pixels** before preview/placement. Existing clear-space and protected-ship checks still apply; two-axis room sizing remains available.

## Corridor continuation and attached rooms — 2026-10-10

- [x] Recognize unambiguous open corridor mouths in existing graph geometry and retain their exact centers for continuation.
- [x] Attach room sides and centered 375 px doors to clear wall/door/corridor starts and the fixed outer airlock door.
- [x] Verify clear-space rejection, openings, topology, eight directions, persistence, cancellation and one-step undo/redo.
- [x] Run source UI checks, rebuild Windows package and verify packaged behavior.
- [x] Inspect and launch the actual refreshed desktop shortcut, confirming the latest packaged UI opens.

This was local feature work at its original handoff; it is now included in published version 0.11.0, with release evidence above.

### Verified evidence and limitations

- `npm test`: **271/271 pass**, no skips. New checks cover eight-direction corridor inference/continuation/arrival and room attachments, fractional centers, branches/pins, ambiguous mouths, real cuts, nearest-wall precedence, ship mirroring, shared topology, original doorway IDs/world positions, stale targets, collisions, centered expansion, atomic failures and exact JSON reopen. A nearby external stub remains unchanged with attachment joining disabled.
- `npm run test:ui` and `npm run test:packaged` pass the complete maintained suites, including the new `scripts/connection-start-smoke.mjs` in both modes, without renderer errors. Five accepted room placements cover corridor END, fixed ship DOOR in both facings, wall CENTER and editable DOOR. Real Canvas labels/dashed previews retain exact anchors and a **375 px** base opening. Continuation shares the original rail vertices. Escape, one-step undo/redo, native project save/reopen and red collision rejection pass. Source and packaged screenshots were visually inspected; the ship-room preview matches the supplied approximate arrangement. Evidence: ignored `artifacts/connection-start-results.json`, `connection-start-packaged-results.json`, screenshots and aggregate logs.
- Existing `npm run test:corridors` and `npm run test:corridor-end` pass unchanged, including original wall/door alignment, safe endpoint fitting and opening preservation. Evidence: `artifacts/connection-prior-corridors.log` and `connection-prior-corridor-end.log`.
- Final focused source/packaged connection checks also verify actual ship hull pixels in all **27** screenshot states per run (minimum **2,398** visible white hull pixels; corridor-room preview **2,509** in both modes), without renderer errors. This strengthens screenshot readiness beyond observing image-draw calls. Evidence: `artifacts/connection-start-source-final.log`, `connection-start-packaged-final.log` and the corresponding results JSON.
- `npm run package` rebuilt the Windows executable and verified all **21** runtime files plus the minimal **0.10.4** manifest against current source; `postpackage` refreshed the actual desktop shortcut. Separate `scripts/update-desktop-shortcut.ps1 -VerifyOnly` readback confirmed direct target `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing target/icon paths. Launched the actual `<desktop>\RevolaMapDrawer - testattava versio.lnk` through Windows Shell. Computer Use observed that executable's clean **8192 × 8192**, **0 walls / 0 doors** editor, new Room guidance and **DOOR** hover at the fixed outer opening. Left Room active at **16%** airlock zoom. No user map was opened or modified.
- Limitations: END inference requires unique paired solid degree-one rail ends; staggered/branched/pinned/obstructed or ambiguous mouths do not attract. A conservative **2,000,000** spatial-check budget omits inferred ends for unsupported density. Attraction retains existing map-space tolerances (mouth midpoint ±29 px at width580). Continuation begins outward along the old rails; mouth arrival requires an opposing normal run. Attached rooms automatically align with the host; Rotate45 controls free rooms. At default grid/style, minimum room width is **900 px** for wall/door/ship starts or **1050 px** for corridor mouths, and minimum depth is **450 px**. A shared base containing another door/erasure rejects attachment, as does extension through corners, branches or fixed pins; compatible solid free ends can extend. Collision checks conservatively reject unrelated centerline touches/crossings/enclosed graph walls and protected ship space. Original references, ship pixels, schema, pinned positions and world scale remain unchanged.

## Static browser build and Vercel — 2026-10-10

- [x] Keep the same native/browser geometry, project schema and export implementation; load optional stars only when a closed map needs them.
- [x] Build a minified allowlisted browser runtime with independently hashed immutable assets and the project license.
- [x] Verify browser local persistence, actual transfer accounting, offline use and worker updates.
- [x] Deploy the verified static output to Vercel and check the public application and response headers.
- [x] Run native source UI, rebuild Windows package, and run packaged UI checks after the shared runtime change.
- [x] Inspect and launch the actual refreshed desktop shortcut, verifying the latest packaged editor visibly opens.

Native verification: `npm run test:ui`, `npm run package` and `npm run test:packaged` pass with no renderer errors. Packaging verifies all **20** runtime files and the minimal **0.10.4** manifest against current source. The postpackage hook refreshes the actual desktop `.lnk`; a separate `-VerifyOnly` readback confirms target `<repository root>\\dist\\RevolaMapDrawer-win32-x64\\RevolaMapDrawer.exe`, empty arguments, repository working directory and existing target/icon paths. Launched the real link through Windows Shell. Computer Use verified the clean visible editor with **8192 × 8192** canvas, fixed ship/upper-corner handles, export controls and **0 walls / 0 doors**. No user map was opened or changed.

### Verified web evidence

- `npm test`: **249/249 pass**, with no skipped tests. Six added web checks cover deterministic builds, runtime/input allowlists, exact PNG bytes, content hashes, Vercel caching/security configuration, bounded build-output cleanup, local worker caching, failed installation cleanup and mismatched HTML rejection. Build cleanup rejects repository ancestors, case variants, unrelated directories and Windows junctions before recursive deletion.
- `npm run build:web`: build **b0b7a3f8919f5522**, app **9cf54f17536d1f39**, eight generated files, **400,043 total bytes** including the deferred **69,321-byte** star image. The initial response-body estimate includes the installer's additional HTML request: **192,573 bytes** with Brotli text/raw PNGs or **207,615 bytes** with gzip text/raw PNGs. Ship/background PNG bytes are unchanged. The deployed runtime contains no originals, personal maps, Electron, external fonts or analytics.
- `npm run test:web`: real desktop Chrome passes connected-wall drawing, measured doors, undo/redo, exact project/editable-PNG reopening, embedded ship SVG, invalid/oversized import preservation, automatic floors, offline exports and **1024 × 700** layout. Raster evidence: **8192 × 8192**, **761,674 visible white pixels**, **66,347,190 transparent pixels**, **374 px** clear door raster run with the exact **375 px** vector interval. No renderer errors, uploads or third-party requests.
- Local host accounting measures **192,573 body bytes / eight requests** for first loading plus installation; controlled reload makes **zero host requests / zero bytes**. Drawing/import/export makes **zero resource requests / zero body bytes**, aside from one independent worker-script **304** revalidation with no body. First closed-map stars load once (**69,321 bytes**). Offline reload and project/PNG/SVG/floor-SVG actions require no host resource bytes. Chromium can perform background worker checks even during Playwright offline emulation; these are recorded separately rather than attributed to map actions.
- A first closure offline, before stars have ever loaded, retains floor SVG export; reconnecting loads/caches stars. A real updated worker waits with **two** existing editor tabs, keeps the unsaved map and old shell intact after the first closes, activates only after the last closes, and opens its next visit offline. Test updates override only the local test host's worker response; they do not alter the production source or trigger release tags.
- The installed Vercel CLI's actual upload matcher selects exactly **26** maintained build inputs. Known originals and personal-map probes in root/source/assets/web, native files/scripts, docs, agent instructions, environment files and generated output are excluded. Production deployment **dpl_4oAFQHpEAU2hphwYxqPTY34UtHAm** returned **READY**, with canonical public URL [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app). Anonymous HTTP checks return 200 for every generated file, with SHA-256 bytes matching the local build; hashed assets have one-year immutable caching and HTML/worker revalidate. Original references, brief, source paths and missing assets return **404**. Public security headers match the maintained configuration.
- `npm run test:web -- --url https://revolamapdrawer.vercel.app` passes against the actual HTTPS production application: cache headers, locally served warm reload, exact **36-wall / two-door** project and PNG reopen, byte-exact ship SVG embedding, offline cached reload/reopen/downloads, and no uploads or other-domain requests. Production and local screenshots were visually reviewed. Maintained generated evidence: `artifacts/web-build.json`, `web-results.json`, `web-production-results.json`, web screenshots and native check logs; all remain ignored.

Limitations: verified browser is desktop Chrome, at **1440 × 960** and **1024 × 700**; mobile/touch and other browsers are unverified. Browser downloads cannot verify destination/completion and retain unsaved-change reminders. Maps are not automatically persisted in browser storage. Offline use requires successful initial installation in the same profile and retained browser cache; the optional stars require prior use or reconnection. Browser update discovery may first reopen the previous worker until the new one installs and all old tabs close. Initial visits, changed application files and small worker checks still incur host traffic.

This browser milestone leaves native release metadata at **0.10.4** with changes in `[Unreleased]`; no new version tag or Windows release was created. Browser-specific deployment instructions and cache limitations are in [WEB.md](WEB.md).

### GitHub web-version handoff — 2026-10-10

- [x] Put the public web app link immediately below the README title alongside the Windows release link; include the web URL in the changelog.
- [x] Update the GitHub repository homepage/description to identify both browser and offline Windows availability.
- [x] Commit the verified web implementation and documentation to `main`, push to `origin/main`, and verify the published repository content.

The owner's Git update request authorizes this source handoff. The runtime is unchanged from the verified browser milestone above; these follow-up edits update documentation and repository presentation. Generated builds, test artifacts, dependencies and the machine-only shortcut remain excluded from Git.

GitHub metadata readback confirms homepage `https://revolamapdrawer.vercel.app` and description “Specialized map editor for Revola: Post Hyper, available in your browser and offline on Windows.” All **24** local documentation links in the changed presentation documents resolve, and `git diff --check` passes. Rechecked the actual shortcut's exact target, empty arguments, working directory and existing paths; package verification still matches all **20** runtime files and the **0.10.4** manifest. Launched the actual `.lnk` again and Computer Use verified the clean **8192 × 8192** editor, fixed ship, export controls and **0 walls / 0 doors**. Closed only this new blank verification instance; the earlier editor was preserved.

Source commit [aa850da](https://github.com/SamiKamara/RevolaMapDrawer/commit/aa850dafd8fea04074b4e81d9261308481445154) (`feat: add browser version and vercel deployment`) was pushed directly to synchronized `main`; local/remote SHA readback agrees. The published README API response confirms the web link immediately below its title. Exactly **17** maintained source/configuration/test/documentation files were committed; generated outputs and original references were excluded or unchanged. [Verify application run 38002662003](https://github.com/SamiKamara/RevolaMapDrawer/actions/runs/38002662003) completed successfully for that exact source commit: geometry/persistence/release guards, native editor, static browser build/UI, packaging and packaged application checks all pass. This documentation-only evidence follow-up uses the established `[skip ci]` commit convention; the tested runtime is unchanged.

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
