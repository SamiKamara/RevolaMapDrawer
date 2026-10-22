# Changelog

Versions use three-part semantic versions. A dated entry describes prepared
source; it does not by itself mean that a GitHub Release has been published.

## [Unreleased]

## [0.14.0] - 2026-10-22

Gameplay object authoring for **Revola: Post Hyper**, shared by the offline Windows application and browser version.

- Preview gameplay-door snapping while hovering or dragging, indicate occupied openings, and support explicit sliding/monochrome hinged doors in Drawer and both Unity generation paths.
- Add optional NPC, door, crate, explosive barrel, weapon and device placement below the architecture tools, with facing controls, selection, deletion and partial NPC overrides.
- Preserve gameplay objects in editable project/PNG metadata while keeping all image artwork architecture-only; integrate category-specific overrides with the Revola editor and runtime generators.
- Add explicit NPC weapons and visible standard generator defaults. Replace letter markers with traced monochrome game vectors and stable 50/50 male/female NPC previews.
- Rename Laser pistol to Suppressed pistol; retire Gunpowder pistol, Laser assault gun and Laser shotgun from new placement/content/weapon lists while retaining old saved placements.
- Synchronize all weapon choices with both game shops and their English names; add Ravager Assault Gun and LAF Laser Rifle, matching vector previews and trusted Unity prefab/loadout support.

Published as the latest Windows x64 portable release with its SHA-256 checksum:
[v0.14.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.14.0).
The same feature set is deployed at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## [0.13.1] - 2026-10-22

Attached-room correction for the specialized **Revola: Post Hyper** editor,
shared by the offline Windows application and browser version.

- Allow chamfered and rectangular rooms drawn against another room to extend beyond the host wall's corners when the new footprint is clear.
- Reuse the original corner junctions and centered doorway, preserving existing doors and saved geometry while rejecting obstructed placements.
- Keep diagonal shared boundaries stable despite coordinate rounding.

Published as the latest Windows x64 portable release with its SHA-256 checksum:
[v0.13.1](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.13.1).
The same correction is deployed at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## [0.13.0] - 2026-10-17

Rectangular rooms and a compact vector ship for the specialized
**Revola: Post Hyper** editor, shared by the offline Windows application and browser version.

- Add a rectangular room drawing tool with four square corners, sharing the existing room attachment, centered doorway, 45° rotation, Shift square constraint and undo behavior.
- Replace the fixed ship and airlock raster rendering with simplified white vector outlines, retaining both exact 375 px doorways, pinned attachment points, scale and door-centered mirroring.
- Export wall SVGs entirely as vectors without embedded PNGs or external resources. The editor and wall PNG export use the same ship geometry.
- Bundle ship vectors into the browser runtime so offline startup and SVG export need no ship image download.

Published as the latest Windows x64 portable release with its SHA-256 checksum:
[v0.13.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.13.0).
The same changes are deployed at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## [0.12.0] - 2026-10-14

Floor closure, eraser geometry and combined saves for the specialized
**Revola: Post Hyper** editor, shared by the offline Windows application and browser version.

- Detect closed maps from visible wall coverage, including overlapping wall ends whose centerlines do not meet; preserve genuinely open exterior doors and erased cuts.
- Remove erased wall geometry and unused graph points so invisible wall skeletons no longer attract or interfere with later editing; support older saved erasures.
- Add **Save all** for wall PNG/SVG, floor PNG/SVG and the editable `.revola` project, retaining the existing layer suffixes.
- Save the complete set to one selected folder in Windows, with one overwrite confirmation and rollback on write failure; download one ZIP in the browser.

Published as the latest Windows x64 portable release with its SHA-256 checksum:
[v0.12.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.12.0).
The same fixes and Save all are deployed at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## [0.11.1] - 2026-10-12

Consistent save filenames for the specialized **Revola: Post Hyper** editor,
shared by the offline Windows application and browser version.

- Name wall PNG/SVG exports `<Map name>-walls.png` / `.svg` and floor PNG/SVG exports `<Map name>-floors.png` / `.svg`.
- Save editable projects as `<Map name>-source.revola`, preserving the same JSON document and support for opening older `.revola.json` projects.
- Apply these names to Windows save-dialog suggestions and browser downloads, including keyboard save shortcuts.

Published as the latest Windows x64 portable release with its SHA-256 checksum:
[v0.11.1](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.11.1).
The same save naming is deployed at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## [0.11.0] - 2026-10-11

Room and corridor drawing improvements for the specialized **Revola: Post Hyper**
editor, shared by the offline Windows application and browser version.

- Hold Shift during room drawing to keep width and depth equal, including rotated rooms and centered doorway attachments; pressing or releasing Shift updates the preview immediately.
- Allow short straight corridor pieces by removing the width-based route length filter; preserve bend clearance and prevent stationary attracted clicks from placing corridors.
- Fix attached rooms disappearing during straight drags by supplying the missing dimension and showing the minimum legal outline during sizing; stationary clicks remain unchanged.
- Continue an existing corridor from its exact open-end midpoint, including saved maps.
- Attach chamfered rooms to the outer airlock door, editable doors, open corridor ends and clear wall midpoints, keeping the adjoining side and 375 px doorway centered on the start.
- Preview and reject obstructed attachments without changing existing openings; preserve one-step undo and editable persistence.
- Add a static browser build for the specialized Revola: Post Hyper editor at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app), with local file import/downloads, content-hashed assets and offline application caching.
- Load the optional star background only when a closed map needs it; preserve native offline files, geometry and transparent exports.
- Add Vercel configuration and browser transfer/offline verification alongside the maintained Windows package checks.

Published as the latest Windows x64 portable release with its SHA-256 checksum:
[v0.11.0](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.11.0).
The shared browser build is deployed at [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## [0.10.4] - 2026-10-08

Airlock wall alignment correction for the specialized **Revola: Post Hyper**
offline Windows map editor.

- Place new wall-start handles on the upper airlock corner centerlines in either
  ship facing, keeping existing saved attachments pinned at their exact coordinates.
- Preserve closed-map floor detection for both old and corrected attachments.
- Verify actual wall previews, drawing, facing changes and native save/reopen in
  source and packaged release checks, with views fitted to smaller test windows.

Published as a Windows x64 portable release with its SHA-256 checksum:
[v0.10.4](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.4).

## [0.10.3] - 2026-10-08

Prepared source only; superseded by 0.10.4 before public release after hosted
verification exposed a test viewport assumption. Its tag remains unchanged.

Airlock wall alignment correction for the specialized **Revola: Post Hyper**
offline Windows map editor.

- Align the airlock's wall-start handles with its upper wall and upright centers
  in either ship facing, so new walls continue straight from the fixed artwork.
- Keep old saved attachments pinned and preserve their exact geometry; both old
  and corrected attachment points support closed-map floor detection.
- Verify the actual wall previews, drawing, ship facing changes and native
  save/reopen in both source and packaged application release checks.

## [0.10.2] - 2026-10-08

First public Windows x64 portable release for the specialized **Revola: Post Hyper**
offline map editor. This is not a general-purpose drawing tool.

- Draw constrained white walls, measured doors, chamfered rooms and constant-width
  corridors around the fixed ship, with shared graph topology and undo/redo.
- Preserve the 8192 canvas, centered expansion to 16384, world scale, ship ports
  and editable PNG/project persistence.
- Export transparent wall PNG/SVG and automatically generated closed-map floor
  PNG/SVG; keep editing background and overlays out of exports.
- Mirror the ship about its doorway center so drawn corridors stay aligned in
  both facing directions, while existing saved geometry remains exact.
- Prepare a Windows x64 portable ZIP, SHA-256 checksums, automated application
  checks and a version-tag release process that creates drafts for owner review.
- License the project's original code, documentation and assets under MIT,
  preserving separate third-party runtime notices in the portable package.

The owner approved public repository visibility and this release on 2026-10-08.
The portable ZIP and checksum are available with
[v0.10.2](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.2). See
[distribution status](https://github.com/SamiKamara/RevolaMapDrawer/blob/main/docs/DISTRIBUTION.md)
and [release instructions](https://github.com/SamiKamara/RevolaMapDrawer/blob/main/docs/RELEASING.md).
