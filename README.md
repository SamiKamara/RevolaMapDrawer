# Revola Map Drawer

**Web app:** [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app) · **Windows app:** [latest portable release](https://github.com/SamiKamara/RevolaMapDrawer/releases/latest)

Revola Map Drawer is a specialized map editor for **Revola: Post Hyper**, available as an offline Windows application and a browser application. It follows the game's supplied map references, with white walls, fixed wall/door/corridor dimensions, 45-degree directions and a fixed ship and airlock. It is **not a general-purpose drawing application**.

Draw on an **8192 × 8192** canvas and export transparent wall PNG/SVG images. Drawing beyond its edge automatically expands the canvas to **16384 × 16384**, around the same world center, without moving or scaling existing geometry. Wall PNGs retain the editable map graph; JSON project files provide an image-independent editable copy. Closed maps also produce separate black floor PNG/SVG images.

The Windows application runs locally without an account, internet connection or development server. The supported native distribution is **Windows x64**. Other native operating systems and architectures have not been packaged or verified. See the [changelog](CHANGELOG.md) for version history and the [verification checklist](docs/CHECKLIST.md) for completed checks and exact limitations.

## Browser application

Open [Revola Map Drawer in your browser](https://revolamapdrawer.vercel.app).

The web build uses the same editor and geometry as the Windows application. Open maps with the browser's local file picker and save them through downloads. Drawing, imported files, generated floors and PNG/SVG exports stay on your computer; maps are never uploaded. Downloads cannot confirm that a file reached its destination, so the editor keeps its unsaved-changes reminder. Keep downloaded projects or editable wall PNGs before closing the tab; browser caching stores the application, not your maps.

After the first successful load and offline cache installation, the application can reopen without a connection in the same browser profile. Hashed application files are cached locally. The optional star background downloads only when a closed map needs it; offline it is available after its first use. New application versions take over after all editor tabs close and the application reopens online. Browser cache eviction or clearing site data requires another online load. Desktop Chrome is verified; mobile touch layouts and other browsers have not been independently verified.

Build, test and deployment instructions, including measured transfer sizes and caching behavior, are in [docs/WEB.md](docs/WEB.md).

## Portable Windows package

The source repository is public. The latest portable release is [v0.10.4](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.4). The first published portable release was [v0.10.2](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.2).

1. Open [v0.10.4](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.4) and download `RevolaMapDrawer-0.10.4-win-x64.zip`. GitHub's automatic **Source code** archives are for development and do not contain a runnable packaged app.
2. Extract the ZIP completely to a folder you can write to. Keep the entire `RevolaMapDrawer-win32-x64` folder together, including `resources` and the supporting DLLs and license files.
3. Run **`RevolaMapDrawer.exe`** inside that extracted folder.

No installation, Node.js, npm or Python is needed to run the portable package. Do not run it inside the ZIP or distribute only the executable. Save your maps in a separate folder so you can replace the application folder when updating.

Release assets include `SHA256SUMS.txt`. You can compare the downloaded ZIP's SHA-256 with that file using `Get-FileHash <zip-path> -Algorithm SHA256` in PowerShell. A matching checksum checks the download against that file; obtain both from the trusted repository release.

The application is currently unsigned. Windows may show an unknown-publisher or SmartScreen reputation warning. Check that the download came from the expected release and matches its checksum before deciding whether to run it. If Windows or an organizational policy blocks execution, follow that policy or contact the administrator.

Release creation and publication are documented in [docs/RELEASING.md](docs/RELEASING.md).

## Drawing

Start above the airlock. The two upper airlock wall ports are the attachment points for your map. The canvas displays a black background for contrast; exports remain transparent.

| Tool/action | Key | Use |
| --- | --- | --- |
| Select | V | Drag on empty canvas to select enclosed walls/points. Ctrl-click toggles items; Ctrl-drag adds an area. Drag a selected member to move the group. A single selected room side still resizes. |
| Copy | Ctrl+C | Copy selected walls and walls between selected points, including doors and erased openings. |
| Paste | Ctrl+V | Preview a copy at the pointer; move and click to place, or press Escape to cancel. Repeat Ctrl+V for another copy. |
| Wall | W | Click to chain walls, or drag to draw one wall. Drawing along an opening fills just the covered portion. Only 0°, 45°, 90° and equivalent directions are allowed. |
| Door | D | Click to place a fixed-size opening; aim near the middle to center it between corners or branches. CENTER in the preview confirms snapping. Click an existing opening to restore the wall. |
| Eraser | E | Drag across walls to erase freely; choose the brush diameter in the top bar. One stroke is one undo action. The ship artwork stays protected. |
| Room | R | Start at DOOR, END or CENTER to attach a room with a centered door. Drag straight outward for a square room, sideways for a default depth, or diagonally to set both dimensions. Free rooms use **Rotate 45°** or **Draw a 45° room** in Quick Guide. |
| Rotate room | Shift+R | Toggle a free room's 45° orientation, including during placement. Attached rooms align with their receiving wall or corridor mouth. |
| Corridor | C | Drag a route for two parallel walls. CENTER or DOOR aligns the start; END continues an open corridor outward before turning. Finish near a target to fit the endpoint automatically. |
| Hand | H | Pan the canvas. Space + drag or the middle mouse button also pans. |
| Zoom | Mouse wheel | Zoom around the pointer. The bottom controls also adjust zoom. |
| Fit map | F | Fit the map in the workspace. |
| Finish/cancel | Escape | Finish a wall chain or cancel the current gesture. |
| Delete | Delete | Remove selected walls and walls attached to explicitly selected points, with one undo step. |
| Undo / redo | Ctrl+Z / Ctrl+Y | Undo or redo completed editing actions. |
| Save wall PNG | Ctrl+S | Export the transparent white wall image with editable project data. |
| Open | Ctrl+O | Open a saved map PNG or JSON project. |

Use **Ship facing right/left** in the inspector to flip the ship around the exact center of its airlock door. The center stays fixed when changing direction after drawing a corridor. Both door openings remain exactly **375 px** wide and the saved ship anchor and graph ports stay fixed. In Corridor mode, hover over the outer airlock door for **DOOR**, then drag outward to start at its exact center; this also works with the ship mirrored. All walls in a map use the same nominal dimensions: **50 px wall thickness**, **375 px clear doorway**, **580 px corridor wall-center separation** (530 px nominal clear space), and **220 px room chamfer inset**. Small deterministic edge variations approximate the reference's irregular white silhouettes.

Room mode uses the same start markers. The clicked point becomes the center of the adjoining side and its **375 px** door, rather than a room corner. At the outer airlock or a corridor end, the room grows outward; at a wall or editable door, drag into either clear side. Moving sideways sets half the room width, and moving away from the start sets its depth. A straight drag supplies the missing dimension automatically; small drags show the minimum room that can contain the fixed chamfers and doorway. **Hold Shift while drawing to lock width and depth to the same size**; pressing or releasing it during the drag updates the preview immediately. This also works for free rooms with 45° rotation. A click alone places nothing. Existing doors are reused; a solid wall midpoint or open corridor end gets a centered door. Red previews reject placements blocked by other walls, openings, corners or insufficient space. Escape cancels and a completed attachment is one undo step. Open corridor ends are recognized from unambiguous paired free rail endpoints, including reopened maps.

In **Select (V)**, start a selection rectangle on empty canvas and hold the left mouse button while dragging. Only fully enclosed walls and enclosed points are selected. Ctrl-click adds/removes a wall or corner, and Ctrl-drag adds another area. Drag any selected member to move the group together. Escape cancels a drag or clears an idle selection. Selection highlights and counts are editor aids and are never exported. An ordinary click on an unselected wall/point returns to single-item editing.

Group movement preserves the relative positions of all selected points, including shared wall joints. Connections to unselected walls can constrain the group to one direction; incompatible connections, ship pins or collisions block the move with visible feedback. Include adjoining walls/points to move a wider group. A completed move, automatic canvas expansion and group deletion each use a single undo action. Single-selection room resizing remains unchanged.

To duplicate a room or wall group, select it with a rectangle or Ctrl-click its points, press **Ctrl+C**, then **Ctrl+V**. Move the preview to a clear area and click to place it. Both endpoints of a wall must be included when copying via points; an isolated point has no copyable wall. Doors, erased gaps and shared corners keep their dimensions. Green means the placement is valid; red means it overlaps/touches existing wall geometry, a fixed ship port or exceeds the map bounds. Escape cancels. A placed copy remains selected and Ctrl+Z undoes the whole placement. **Copy** and **Paste** buttons are also available in Selection.

Copies remain available across New/Open in the same editor window until you copy another group or close the app. This is an internal map clipboard: it does not transfer between separate app windows or other programs, and ordinary text-field copy/paste keeps working. The ship is not copied. Copies use the destination map's style and remain separate from existing geometry; paste does not join or overwrite walls.

Bring nearby wall ends approximately together while drawing or dragging: compatible ends snap into a shared corner, and supported connections into a wall become T-junctions. The capture range is 50–100 map pixels depending on zoom. Existing door and erased gaps stay open unless explicitly drawn over. Continue a straight wall from anywhere along it; its texture stays continuous through overlapping strokes and graph splits. Corners use sharp, bounded miters. These rendering improvements and the upper airlock doorway also apply to reopened older projects without shifting their geometry.

Door centering measures the whole straight section between turns or branches, ignoring incidental splits from earlier drawing. It attracts only within 50 map pixels or 5% of that section's length, whichever is smaller. Aim farther away for an off-center door. A door can cross an incidental split while keeping its 375 px clear width. Real erased gaps end the measured section; existing openings and fixed ship ports remain protected.

Corridor starts use the same straight wall sections. Hover near a midpoint to see **CENTER**, or over/just beside an existing opening to see **DOOR**. Press and drag to lock that exact start for the route, including fractional coordinates on diagonal walls. Doors take precedence over midpoint attraction. Midpoint attraction is limited to 50 map pixels or 5% of the uninterrupted section; door attraction covers the opening plus a 50 px margin. The pointer must also be within 50–100 map pixels of the wall, depending on zoom. Farther away, starts follow the usual grid. Existing door openings remain unchanged; starting at a solid wall does not cut a new opening. Use the Door tool to connect through that wall. For both corridor walls to meet the starting wall, depart perpendicular to it; alignment does not lock the route direction. Escape cancels the route.

Straight corridor pieces can be as short as one grid step (**25 map pixels** with the default style). Zoom in for small movements: drawing requires more than three screen pixels of actual drag, and a stationary click places nothing. The fixed corridor width still requires room for bends; tight corners and reversals are rejected.

When a free wall end nearly meets another wall's outer face, drawing or moving either wall extends the end to the receiving centerline and creates a shared junction. This also works when the receiving wall is drawn last, or with room/corridor boundaries. Reopened projects keep their geometry unchanged; draw along an old near-wall stub to repair its small gap. The extra face allowance is 8 map pixels beyond the wall half-width plus roughness, capped at 50 pixels of extension. Larger gaps and actual door/eraser cuts remain open. Each join belongs to the same undo action as the edit.

Draw with the Wall tool along an erased section or doorway to rebuild it. Covering an entire door restores a solid wall. Covering only part removes its fixed-door classification and leaves an ordinary gap of the remaining size. Door count reflects only intact 375 px doorways. New maps use a 2.25 px edge variation; opening an older map preserves its saved style.

Room resizing recognizes rectangular and equally chamfered closed outlines, including rotated rooms, deliberate door openings, and sides split by wall attachments. It works after reopening a saved map and does not depend on primitive history. A broken outline, uneven chamfers or an ambiguous wall shared by two rooms uses ordinary local wall editing. An incompatible attachment or collision blocks the resize.

When new geometry crosses the default boundary, the original 8192 square occupies the central half of the expanded 16384 image: 4096 pixels are added on each side. Existing wall coordinates, ship position and detail size stay unchanged. The expansion is part of the drawing action's undo. The larger canvas stays expanded after subsequent erasing or deleting.

## Saved files

| Action | Contents | Reopens as an editable map? |
| --- | --- | --- |
| Save project | `.revola.json` graph, openings, style and ship orientation | Yes |
| Save wall PNG | Transparent white walls and ship, plus embedded project data | Yes, while its metadata is retained |
| Save wall SVG | Transparent vector walls with one embedded ship PNG | No |
| Save floor PNG / SVG | Black floor on transparency, available for closed maps | No |

The editor checks whether the ship has a route to open space, treating doors and erased openings as traversable. Close every opening in the outer boundary; internal doors are allowed. A closed map automatically displays a solid black floor beneath the white walls and the supplied repeating star texture outside it. Only the interior reachable from the ship is filled; sealed courtyard voids stay transparent. The floor extends **12 map pixels** beyond the outer wall silhouette, including the ship hull.

**Save floor PNG** and **Save floor SVG** in the top header save only the black floor on transparency, at the map's full 8192 or centered 16384 canvas size and original scale. They become available automatically once the current map is closed. Stars, white walls and editing aids stay out of these files. These are image exports without editable map data; also use **Save project** or **Save wall PNG** for an editable copy. Automatic floor generation and export leave project history and unsaved changes intact. New/Open and geometry edits recheck closure and update the floor without an extra action.

When finishing a corridor, aim near the same **CENTER** or **DOOR** targets used for starts. A safe fit adjusts the entire route automatically, locks its original start and keeps its 45° segment directions. **END · CENTER** or **END · DOOR** marks the fitted preview; release places it, and **Ctrl+Z** undoes the whole corridor. The fit minimizes movement of the route's bends. A target outside the attraction zone, an off-ray straight route or an unsafe fit keeps ordinary drawing behavior. It does not open a solid wall; use the Door tool for that connection.

**Save wall PNG** produces an ordinary transparent white wall PNG with one `RevolaMap` iTXt metadata chunk. That chunk contains the versioned JSON graph, door positions, style, seed and ship orientation. Reopening the PNG restores those editable objects. The metadata size is proportional to the graph rather than the 8192-pixel image dimensions.

**Save project** writes the same editable document as `.revola.json`, useful for backup and interchange without the image. Keep a project copy if another image editor or optimizer will process your PNG: such programs may remove custom metadata.

**Save wall SVG** exports a transparent, self-contained image with white vector walls. Continuous wall runs are merged and unnecessary outline points are removed within a 0.25 map pixel tolerance; door and eraser cut endpoints and corner miters stay exact. The bundled ship PNG is embedded once to preserve its detail without a large raster trace. The SVG retains the full 8192 or 16384 canvas at its original scale, contains no editing overlays or external image dependencies, and omits project metadata. It cannot be reopened as an editable map; SVG export leaves unsaved changes marked, so also save wall PNG or a project to continue editing later.

A PNG with no Revola metadata, including the two supplied reference images, cannot be opened as an editable map. The editor does not infer wall topology from raster pixels. Damaged or invalid imports are rejected before replacing the current map. PNG import is bounded to 32 MiB and embedded project metadata to 4 MiB. Version 1 maps still open; new saves use version 2 to retain arbitrary erased gaps and centered expansion. The older 0.1 app cannot open version 2 maps.

## Development and verification

Development requires **Node.js 22.12.0 or newer** and npm on Windows. CI uses Node.js 24. The first dependency installation needs an internet connection; the application itself stays offline.

```powershell
npm ci
npm start
```

`Start-RevolaMapDrawer.cmd` opens a packaged app when one exists. Otherwise it installs development dependencies if needed and starts Electron. Rebuild the package after source changes to keep that launcher current.

For browser-based UI development, run `npm run preview` and open the local address it prints. This preview uses downloads and file selection; the native desktop app uses native file dialogs. The development preview server is not part of the portable app.

Run the baseline verification and package checks:

```powershell
npm test
npm run test:ui
npm run package
npm run test:packaged
```

`test:ui` and `test:packaged` each include wall SVG, floor export and airlock wall-start checks. Focused checks are also available as `test:feedback`, `test:joining`, `test:diagonal`, `test:doors`, `test:selection`, `test:clipboard`, `test:corridors`, `test:corridor-end`, `test:airlock`, `test:ship-ports` and `test:raster`. Run the checks relevant to changed behavior and record actual results in [docs/CHECKLIST.md](docs/CHECKLIST.md).

The Windows build is written to `dist/RevolaMapDrawer-win32-x64/`. Run **`RevolaMapDrawer.exe`** inside that folder; distribute the whole folder, not only the executable. Rebuild after source changes to refresh the packaged version used by the launcher and desktop shortcut. Build output, dependencies and generated test artifacts are excluded from source control.

The local desktop shortcut **`RevolaMapDrawer - testattava versio`** opens that packaged executable with no arguments and the repository root as its working directory. This is a development handoff shortcut; portable release users can run their extracted executable directly.

`npm run package` automatically creates or refreshes the desktop shortcut through its `postpackage` hook. To repair it after moving the checkout, run the following from the new repository root after a packaged executable is available:

```powershell
npm run shortcut
```

The `.lnk` file is local to the computer, outside the repository, and is never committed. No separate machine-only launcher is required. Every milestone handoff checks its actual target, empty arguments and repository working directory, verifies those paths exist, launches the actual link until the UI opens, and confirms the packaged application includes the latest supported changes. This requirement is maintained in [AGENTS.md](AGENTS.md), with completed evidence in the checklist. If a version is not yet testable, the milestone notes must state that explicitly instead of offering a misleading shortcut.

The unit tests cover geometry constraints, doorway behavior, rendering determinism and persistence validation. The UI smoke script exercises the running interface and export/open workflow. Actual completed checks and any exceptions belong in [docs/CHECKLIST.md](docs/CHECKLIST.md).

## Current limits

- Room-aware movement preserves recognized room shapes and can stretch compatible attached walls. Ordinary local dragging supports corners with one or two incident walls. Arbitrary branched network reshaping remains unsupported; moves causing collisions, invalid angles or insufficient door clearance are rejected. Attached ship ports remain pinned.
- A dedicated detach/rejoin tool is still pending. Individual walls can be deleted and redrawn; newly intersecting walls automatically share graph vertices.
- Corridor turns sharper than 90°, very close corners and self-overlapping routes are rejected. Draw a simpler route or use manual walls to build more complex intersections.
- Endpoint fitting preserves the start and existing segment directions, moves any route point by at most 300 map pixels and skips unsafe connections. A straight route cannot align to an off-ray target; parallel wall arrivals do not align. It does not add turns or create a doorway.
- The ship and airlock are a fixed raster anchor, not editable wall graph objects. The normal door tool does not cut the ship.
- Wall texture is a deterministic approximation of the reference's irregular edges. The ship is extracted from source pixels, with unrelated upper room walls masked and a bounded symmetric airlock correction. The hull outside that correction stays unchanged. Dimensions inferred from the raster references and the extraction steps are documented in [docs/REFERENCE_ANALYSIS.md](docs/REFERENCE_ANALYSIS.md).
- PNG export uses a canvas at most 256 rows tall, with overlapping guard rows to avoid seams, including at 16384 × 16384. It does not allocate a full-map RGBA canvas. Large exports may take a moment; a progress percentage is shown in the status bar.
- Floor generation is bounded for dense geometry. If its analysis cannot complete safely, the floor and star preview are omitted and floor exports stay disabled.

## Documentation and references

The maintained design is in [docs/DESIGN.md](docs/DESIGN.md); reference dimensions and ship extraction provenance are in [docs/REFERENCE_ANALYSIS.md](docs/REFERENCE_ANALYSIS.md). The original Finnish brief and both source PNGs remain unchanged at the repository root.

Black-background previews and exact scan evidence in `docs/reference-analysis/` are generated local evidence, excluded from source control. To regenerate them and the ship asset with Python and Pillow:

```powershell
python scripts/analyze-references.py
```

Python and Pillow are only needed for this development utility, not to run or package the editor.

## License and supplied artwork

Revola Map Drawer is available under the [MIT License](LICENSE), copyright **2026 SamiKamara**. You may use, modify and redistribute the project, including commercially, while retaining its copyright and license notice in copies or substantial portions of the software. The license covers the project's original code, documentation and assets unless a component is separately identified as third-party material. [The standard MIT terms](https://opensource.org/license/mit) describe the notice requirement and warranty disclaimer.

You can use and share exported maps without adding a Revola Map Drawer credit. The software's notice requirement does not require a credit printed on every map. Bundled Electron/Chromium and other third-party components retain their own licenses. The reference notes record how supplied materials were used without asserting ownership of the Revola game or third-party materials. See [distribution and asset provenance](docs/DISTRIBUTION.md) for the project license, bundled notices and material provenance.
