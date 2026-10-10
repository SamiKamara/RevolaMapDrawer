# Revola Map Drawer — implementation design

Implementation baseline: version 0.11.0. Product source: the unchanged original Finnish brief `../alustava toteutusohje.txt` and the two supplied reference PNGs. UI language: English. Update this document when implementation decisions change. Current completion evidence and deferred requirements are in [CHECKLIST.md](CHECKLIST.md); version history is in [CHANGELOG.md](../CHANGELOG.md).

## Product and first milestone

A standalone, offline Windows map editor specialized for **Revola: Post Hyper**, not a general-purpose drawing application. Draw white, constant-width walls at multiples of 45 degrees on a black editing canvas. A fixed ship and airlock anchor the lower part of every map. The current application exports transparent wall PNG/SVG and separate closed-map floor PNG/SVG images; wall PNG and JSON project files retain editable geometry.

The first runnable milestone established manual walls, fixed-width door cuts, undo/redo, zoom/pan, ship mirroring, editable project saving/loading, transparent PNG export, chamfered rooms and constant-width corridors. Later versioned sections below describe the implemented extensions. General branched network deformation, explicit detachment and advanced self-intersecting corridor routing remain outside the supported scope; do not infer unrestricted drawing/editing from the implemented tools.

## Distribution contract

- The supported portable package is Windows x64. Bundle Electron and every supporting file so users can extract the complete folder and run `RevolaMapDrawer.exe` without Node.js, an account, internet access or a development server.
- Release automation, asset naming, validation and agent commands are maintained in [RELEASING.md](RELEASING.md). The owner authorized the public repository and first portable release, [v0.10.2](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.2), on 2026-10-08. Future automation creates drafts that require explicit owner authorization to publish.
- License the project's original code, documentation and assets under [MIT](../LICENSE), unless separately identified as third-party material. Preserve the project copyright/license notice and the runtime's separate notices in software copies; the portable folder includes `LICENSE-RevolaMapDrawer.txt` alongside Electron's unchanged license files. Exported maps require no added Revola Map Drawer credit. Maintain provenance and third-party scope in [DISTRIBUTION.md](DISTRIBUTION.md).
- Keep generated packages, dependencies, screenshots and `docs/reference-analysis/` evidence out of source control. Maintain reproducible scripts and explanatory Markdown instead. The original brief and source PNGs remain unchanged.
- `npm run package` refreshes the machine-only desktop test shortcut through `postpackage`. Milestone handoffs inspect and launch the actual shortcut and verify the packaged source is current, as required by [AGENTS.md](../AGENTS.md). The `.lnk` stays outside the repository.

## Architecture and ownership boundaries

- Electron desktop shell with an isolated renderer, no Node integration, a small preload bridge, native file dialogs, and local files only. A local HTTP preview also permits browser QA. The desktop distribution must not need a running development server.
- Dependency-light vanilla JavaScript ES modules, HTML and CSS. Canvas 2D provides pan, zoom, editing overlays and raster export. The pure geometry and serialization modules must run in Node tests.
- `src/model.js`: document schema, graph vertices/edges, snapped construction, intersections, doors, primitives and constraints. Geometry uses map pixels and is independent of zoom.
- `src/png.js`: PNG chunk reading/writing with CRC validation; UTF-8 editable document in an ancillary iTXt chunk, bounded parsing and plain project fallback.
- `src/render.js`: deterministic wall edge texture, shared by editing and export, and ship rendering. Reference analysis records measured constants and asset provenance.
- `src/app.js`, `index.html`, `src/style.css`: tool interactions, history, file actions, inspector, keyboard shortcuts and status feedback.
- `electron/`: native window and filesystem bridge. `scripts/`: preview/build utilities. `tests/`: geometry and persistence regression checks.

## Browser distribution

The browser version uses the same `index.html`, `src/` geometry, rendering and local file-input/download paths as the native application. `npm run build:web` emits a separate allowlisted static build in ignored `web-dist/`, with minified content-hashed JavaScript/CSS and byte-identical hashed ship/background PNGs. Vercel serves only this output, without server functions, map uploads, analytics, remote fonts or external runtime dependencies. Keep the native file-based loading contract unchanged.

Hashed assets have one-year immutable browser caching. A web-only service worker caches the complete editor shell and fixed ship, serves repeat/offline loads locally, and caches the optional star background on first use. Load that background only after floor analysis finds a closed map. It can be unavailable on a first offline closure; floor analysis and exports do not depend on the background. Offline caching stores application files only; there is no automatic map persistence. Downloads preserve the existing conservative dirty-state behavior because their completion cannot be confirmed.

An updated worker waits until every previous editor tab closes, preventing a running editor from switching source versions. Reopening online allows the browser to discover an update; the first reopening may still use the previous worker until it finishes installing. Cached versions and browser storage can be evicted. See [WEB.md](WEB.md) for deployment, measured transfer sizes and exact verification scope.

## Document and geometry contracts

### Version 0.11.0 Shift square rooms and short corridors

Holding Shift during a Room gesture constrains the footprint's width and depth to the larger requested dimension, preserving the drag quadrant and existing 220 px chamfers. Free rooms constrain their endpoint before the existing optional 45° rotation. Attached rooms use the host's local frame, preserve the exact receiving-side/door midpoint and apply legal doorway/chamfer minima; their equal side is rounded up to twice the document grid so both half-width and depth remain grid-valid. Pointerdown, pointermove and release read the modifier, while Shift keydown/keyup recompute the current preview without requiring another pointer movement. Releasing Shift returns to the original unconstrained pointer aim. Shift+R retains its rotation shortcut.

Corridor route quantization retains any nonzero grid step instead of discarding steps shorter than 60% of corridor width (348 px at width580). This permits short straight pieces, including fixed/editable doorway starts and continuations. Default axis-aligned steps can be 25 px; diagonal steps retain the ordinary 45° grid rules. The pure boundary geometry continues rejecting reversed or overlapping offsets at tight turns. Track the actual corridor pointer press and require more than three screen pixels of movement for previews and placement; attraction offsets alone and returning to the press point make no edit. When a press attracts to a target, translate sampled/release route aims by the same start correction, so a short outward drag beside a door keeps its actual direction and distance. Receiving-target lookup still uses the raw release aim before fitting. Endpoint attraction cannot collapse a short route into its own start.

### Version 0.11.0 corridor continuation and attached rooms

Infer an open corridor mouth from an unambiguous pair of solid, unpinned degree-one rail endpoints exactly one corridor width apart, with parallel incident rails extending into the same side and no conflicting wall across the opening. No persistent primitive metadata is required, so existing saved graphs qualify. `corridorEndTargets` supplies its exact midpoint, mouth tangent and outward continuation direction. `resolveCorridorStart` shares nearest-geometry precedence and bounded attraction with editable wall centers/doors and the fixed outer doorway. END marks a mouth. A continuation's first run follows its outward direction; subsequent runs use ordinary eight-direction route quantization. Endpoint arrival at a mouth must approach along its normal from outside.

`src/room-start.js` shares this resolver for Room hover and pointerdown, with structural doorway-clearance checks. An attached room's receiving side midpoint stays exactly at the resolved point, including fractional/diagonal coordinates. The pointer's tangent displacement sets half-width and its normal displacement sets depth, rounded in the local frame to the document grid. A negligible component (within 75 map pixels) receives a square-room default from the other dimension, and legal grid-rounded chamfer/doorway minima apply during sizing. Normal-only and tangent-only drags therefore show and place rooms; tangent-only graph-wall drags choose a deterministic upward/left side, while ship/corridor growth follows the fixed outward normal. Actual inward ship/corridor drags remain blocked. Its 220 px chamfers and orientation follow the host. Editable walls/doors allow either clear side. The rotation checkbox continues controlling free room construction.

The attachment reuses an existing doorway and its ID or creates a centered 375 px doorway at a solid midpoint/open mouth. Shared base geometry retains original cuts and rail junctions. Validate the complete placement in a cloned document before mutation, rejecting unrelated boundary touches, wall intersections, enclosed geometry and competing openings. Preview shows the cut base and uses red for blocked placements. Track the actual pointer press separately from the attracted anchor and require more than three screen pixels of movement for preview/placement; stationary clicks and returning to the press point create no room. Hover, preview and cancellation leave history, document bounds and geometry unchanged; actual release is recomputed and a successful attachment, including centered expansion, is one undo action. Ship geometry/pins and the version 2 schema remain unchanged.

### Version 0.10.3 airlock wall-start correction

Visible wall-start handles use the upper airlock corner centers: ship-relative
**(-356.5,-40)** and **(+385.5,-40)**, world **(3739.5,4700)** and
**(4481.5,4700)**. The measured upright centerlines and outer-door wall plane
define these coordinates; the supplied feedback image is approximate. The
door-centered mirror transform swaps these two points while retaining the same
world positions. Wall hover, pointerdown and endpoint snapping share `shipPorts`.

The original saved pins at **(3739.5,4740)** and **(4452.5,4740)** remain fixed.
`isShipPort` protects both generations in movement, structural doorway spans and
paste validation. Import never relocates existing walls. The floor barrier keeps
its legacy paths and adds a 29 px horizontal bridge inside the upper white wall
to the corrected right corner, allowing either generation to close a station in
either facing. The ship anchor, raster, corridor doorway target, scale, canvas
bounds and version 2 document schema remain unchanged. Version 0.10.3 prepared
this correction; version 0.10.4 fits release-test views to smaller windows before
public distribution. The application geometry is identical between these patches.

### Version 0.10.2 fixed doorway mirror pivot

Ship facing right/left reflects the artwork about the outer airlock door's exact center, asset-local (1283.5,30). Keep the legacy document anchor (4096,4740), graph ports at x±356.5 and all drawn geometry unchanged. The mirror axis is 14.5 map pixels right of that anchor, so mirrored artwork uses translation (ship.x+29,ship.y) before horizontal reflection. Both outer/inner door centers remain (4110.5,4700)/(4110.5,5308) in either orientation. Normal artwork placement is unchanged. `shipWorldPoint` supplies this transform to canvas/PNG, SVG, bounds, door targets and floor geometry. Synthetic floor-barrier bridges retain the original fixed graph pins while the actual hull and floor seed use the corrected artwork pivot. Document schema stays version 2; older saved graph coordinates remain exact, including any corridor previously drawn at the old mirrored center.

### Version 0.10.1 automatic closed-map floor generation

The editor automatically derives and displays a black floor from the current graph and fixed bundled ship geometry whenever closure enables the star background. Closure means that open space cannot be reached from the ship, treating every door and erased gap as traversable. Internal doors remain allowed. A real opening on the exterior boundary prevents generation. Closure and floor coverage are derived editor state, with no document-schema or history change. New/Open and geometry edits recheck closure and update the floor automatically; there is no generation action, preview toggle or Floors inspector panel.

Fill the interior reachable from the ship through actual door/gap openings and the actual shared wall outlines, including the fixed ship hull. Sealed courtyard voids remain transparent, including disconnected nested boundary loops; an internal door makes its adjoining area reachable and therefore floor. A separate uncut arrangement rejects exterior doorways/erasures even in compartments isolated from the ship. Add a **12 map pixel** black rim beyond wall coverage, following the supplied floor reference's approximately 10 px margin. Canvas dimensions, world origin, center, ship pins and geometry scale remain unchanged. Floor PNG is black grayscale plus alpha, uses the existing bounded stripe export, and omits editable metadata. Floor SVG is a self-contained black vector image. Both contain only floor coverage on transparency; wall exports retain their existing white content. Floor exports never clear unsaved project changes.

Closed maps display the user-supplied `assets/editor-stars.png` as a repeating editor background. It is bundled for offline loading and never enters any export. The top header exposes **Save wall PNG**, **Save wall SVG**, **Save floor PNG** and **Save floor SVG** in one row with shared button geometry; PNG buttons share one visual treatment and SVG buttons another. Floor save actions become available automatically once the current map's closure check succeeds and no editing gesture or save is active. The fixed ship contour is derived from the bundled asset; the original brief, references and user's input maps remain unchanged.

Exact visible centerline intervals determine graph topology at a 1e-9 map-unit joining tolerance. Door cuts retain their measured width and valid subpixel erasures stay open; closure never relies on a coarse raster grid. The fixed hull's closure contour is simplified within 1 px, while its filled footprint is traced from every visible bundled alpha pixel. Spatial intersection/probe buckets and explicit 2,000,000-check limits bound dense analyses. Unsupported density leaves floor saves disabled and omits floor/stars rather than returning a false closure result. The derived result cache includes the texture seed as well as bounds, graph, ship and style.

### Version 0.9.1 symmetric fixed airlock and outer-door targeting

The bundled airlock reflects its left side onto the right about source x4090.5. Both aligned openings stay exactly 375 pixels wide; the upper opening retains its original x3903–4278 interval. The correction is confined to source [3670,4670,4511,5355); the anchor, original source PNGs, hull below that region and existing graph ports at ship x±356.5, y4740 remain fixed. Extraction remains reproducible through `scripts/analyze-references.py`.

`src/ship.js` exposes the fixed outer doorway as an interaction target at ship offset (+14.5,-40). Before v0.10.2 its x offset reversed when mirrored, giving center (4110.5,4700) normally or (4081.5,4700) when mirrored; the corrected doorway pivot now retains (4110.5,4700) in both orientations. The corridor resolver considers this opening alongside editable walls using the same perpendicular tolerance, opening width plus 50 px margin and nearest-wall precedence. Preview, pointerdown and endpoint fitting retain the exact fractional center. Direction metadata lets endpoint fitting handle a fixed raster doorway without inserting a synthetic graph wall. Corridor width remains 580 pixels; targeting creates no door and changes no ship artwork or pins. Only the outer door is exposed because the lower opening leads into the protected ship interior. Document schema stays version 2.

### Version 0.8 automatic corridor endpoint alignment

During a corridor drag and at release, reuse the start resolver on the actual pointer aim, including movement below the input sampling threshold. The same nearest-wall precedence, span bounds, erasure exclusions and map-space attraction tolerances apply. Targets are not selected from the quantized route endpoint. Arrivals parallel to the receiving wall are not aligned as connections.

`fitCorridorEnd` in `src/corridors.js` fixes the exact original start and target endpoint while retaining the quantized route's segment direction sequence and turn count. Minimize the sum of squared displacement of corresponding interior route points, then reject infeasible directions, reversal, unsafe corners, self-overlap or more than 300 map pixels of displacement at any point. This is the closest fit within those direction and point-correspondence constraints, not a global search over alternative turns. Straight routes can only fit a target on their existing ray. Preserve fractional coordinates; do not round the fitted route to the grid.

Reject fitted rails that would overlap and fill an existing door or erased interval; normal insertion validation deliberately permits manual overdraw. Then validate insertion into a cloned document before using the fitted route. Show the fitted route and **END · CENTER** or **END · DOOR** during the drag. Recompute from the actual release and insert automatically, without an extra confirmation. Preview and cancellation leave geometry, dirty state, history and bounds unchanged; release commits in one undo action, including any centered expansion. No nearby target or an unsafe/infeasible fit retains ordinary drawing behavior. Existing doors and ship ports remain protected; alignment does not cut a door or change corridor width. The saved document schema stays version 2.

### Version 0.7.1 diagonal corner starts

Wall-start attraction first chooses the nearest visible graph endpoint within the existing 50–100 map pixel tolerance, then falls back to a solid centerline projection. The projected aim and endpoint must share an uninterrupted solid span, so a door or erasure cannot become an implicit attraction target. Reuse connected corners as well as free ends. This keeps a new diagonal start from splitting a nearby side and crossing the next side into a tiny triangle or leaving a short terminal spur. Preview and insertion use the same pure `snapWallStart` resolver; the common start correction translates the new end without changing its direction. Explicit zero tolerance, erased endpoints, real openings, fixed ports, angle checks and atomic insertion remain protected.

Miter join fills overlap the incident runs within their already-solid interiors. Exact exterior outline points and the existing cut-clearance guard remain unchanged. This removes an internal Canvas antialias seam that can otherwise leave alpha 247 in a fully solid diagonal corner, including mirrored orientations. Editor and export continue sharing the same renderer.

Import and rendering preserve the exact saved graph. Old projects can contain actual tiny branches or erasures at the pictured bends; the start-attraction fix prevents new malformed starts but does not delete saved cuts or silently normalize those projects. Draw over an erased interval to fill it, or delete and redraw an affected corner. The document schema remains version 2.

### Version 0.7 selection copy and paste

Ctrl+C captures an immutable, session-local graph fragment: selected walls plus walls whose two endpoints belong to the effective selected point set. Keep shared vertices, doors and erased intervals; omit exterior connections, loose points and fixed ship artwork. Copying makes no document or history change. Copy/Paste buttons expose the same actions; text fields retain native clipboard shortcuts. The map clipboard survives New/Open in the same editor window and is not stored in map metadata or the system clipboard.

Ctrl+V enters Select mode with a floating preview centered at the pointer, or viewport center when the pointer is outside the canvas. Snap one common translation to the destination grid, preserving all relative and fractional geometry. A green preview can be committed with one click; blocked placement is marked in red and can be repositioned. Escape or a tool change cancels without a document edit. The new walls become a selected group, and further Ctrl+V placements reuse the original copied snapshot. Each placement, including centered canvas expansion if needed, is one undo action.

`src/clipboard.js` remaps vertex, edge, door and gap IDs, then validates the entire draft before mutation. Copied groups remain independent: centerline overlap, touching/crossing existing geometry, fixed ship ports and invalid bounds reject the whole placement. They do not automatically join old walls. Source pins do not pin translated copies. Destination map style and texture seed apply; document schema stays version 2.

### Version 0.6 corridor start alignment

Corridor hover and pointerdown share the pure `resolveCorridorStart` helper in `src/corridors.js`. The nearest wall under a bounded 50–100 map pixel perpendicular tolerance supplies the target, so an unrelated farther opening cannot pull the start across nearer geometry. Reuse the door tool's structural span traversal through degree-two collinear splits, stopping at corners, branches and pinned ports. Erased gaps further bound the span and do not attract.

Attract near a solid span midpoint within 50 map pixels or 5% of its uninterrupted length. Prefer an existing door center when the aim falls within that opening plus 50 map pixels along its host wall. Hover shows CENTER or DOOR, with a start marker retained during the route. Resolve once at pointerdown and retain the exact target through simplification, 45-degree route quantization, preview and commit; never round a resolved fractional/diagonal center back to the grid. Unattracted starts use the existing grid. This alignment creates no automatic door, does not change the fixed 580 px corridor width, and does not override geometric validation. Existing cuts and topology remain protected by atomic corridor insertion. A route is one undo action; cancellation does not edit the document. The document schema remains version 2.

### Version 0.5 multi-selection

Select mode supports a left-button rectangle started on empty canvas, fully enclosing walls or individual graph vertices in either drag direction. Ctrl-click toggles a wall or point; Ctrl-marquee adds its enclosed items. A normal click on an unselected item replaces the selection. Dragging a selected member retains and moves the group. Selection is temporary UI state, deduplicates shared vertices, and is never saved into map metadata or recorded as a document edit. Escape cancels the active gesture; while idle it clears selection. Single plain wall/point drags keep existing room-resize and constrained local movement behavior.

Group movement translates all selected vertices and selected-wall endpoints by one common offset, preserving their relative shape, IDs and internal openings. It never individually attracts or detaches group members. A connection to stationary geometry can stretch on its original ray: parallel boundary walls constrain the common delta to that direction. Conflicting boundary directions, selected ship ports, collisions, reversal, insufficient doorway clearance or maximum map bounds reject the whole edit. Selecting the adjoining geometry allows movement of the wider group. Expansion and a completed move are one undo step. Arbitrary branched deformation remains outside this behavior.

`src/selection.js` provides pure membership, area and deduplication helpers. Ctrl-removing a corner of a selected wall excludes that point from movement while retaining the wall's other end as a point selection. Delete removes selected walls and walls incident to explicitly selected points, in one undo action; implicit endpoints of selected walls do not cause unrelated neighboring walls to be deleted. Cancellation never commits the preview.

### Version 0.4 door targeting and small face gaps

`src/doors.js` supplies a pure targeting helper shared by the preview and model. Measure straight spans through degree-two collinear joints, stopping at turns, branches, ends and pinned ship ports. Erased intervals further bound the visible span. Door attraction is at most 50 map pixels and 5% of the available span; an invalid midpoint falls back to the original aim if that position is legal. The preview shows CENTER when snapped. Existing-door removal uses the raw pointer hit. To cut across an incidental split, consolidate only that unbranched straight span, preserving endpoint IDs and every existing door/gap ID and world position. The new opening remains exactly 375 px. Invalid edits do not mutate the document.

Drawing or moving a receiving wall also checks nearby existing free ends, so drawing order cannot leave a hairline gap at its face. An end may extend forward on its original ray to a solid centerline when its normal separation is at most half the wall width plus roughness plus 8 px, with a 50 px maximum extension. The touched wall can be either participant. Room/corridor construction uses the same rule. Spatial buckets bound candidate discovery; the optional joins are validated atomically before acceptance. A split earlier in the same edit must remap subsequent openings on the actual incident child edge. Door/eraser cuts, ship pins and unrelated geometry remain protected. Import remains exact: old small gaps are repaired by redrawing their stub, not silently on load. No renderer patch covers real cuts. Document schema remains version 2.

### Version 0.3 wall joining and rendering

Nearby free wall ends can extend or trim to a common intersection while retaining their original 0/45/90-degree lines. The result is one shared graph vertex, including supported T-junctions. Snapping is bounded in map coordinates; the UI uses 50–100 map pixels depending on zoom. Real erased intervals and doorways are not implicit join targets. Pins, doorway clearance and topology validation still apply, and invalid edits roll back. Drawing previews and committed walls use the same endpoint resolver.

Render collinear visible intervals as continuous runs with a canonical world-coordinate texture lattice, independent of graph IDs, direction or segmentation. Fill wall outlines and bounded miter joins in one path to avoid internal antialias seams. Preserve the exact ends of genuine door and eraser cuts. Miter radius is capped at 75 px; construction/movement reserve that same boundary margin to prevent clipped tips. New rendering applies also when older projects are opened; graph and saved roughness remain unchanged.

Every ship prefab now includes the upper doorway from the supplied reference. The source crop extends from y4670 to y6601; its local anchor is (1269,70), keeping document anchor (4096,4740), both pinned ports and the lower artwork unmoved. Unrelated room-wall pixels outside the upper airlock are masked only in the added 70 rows. The upper opening remains 375 source pixels, including when mirrored. See `REFERENCE_ANALYSIS.md` for exact extraction and preservation evidence. The document schema remains version 2.

### Version 0.2 feedback implementation

The new document schema is version 2; version 1 projects remain readable and upgrade on load. World coordinates stay stable. Default bounds are [0,8192] × [0,8192]; once a committed drawing or movement crosses that boundary, canvas dimensions become 16384 with origin (-4096,-4096). The original center (4096,4096), ship and existing walls do not move or scale. Expansion is part of the same undo transaction and is never automatically shrunk afterward. Rendering/export translate the origin; the maximum supported world bounds are [-4096,12288] in both axes.

Edges retain fixed-size `doors` and gain arbitrary normalized `gaps:[{id,start,end}]` for erased portions. A collinear wall stroke fills only its covered intervals. If it touches only part of a door, the remaining opening becomes ordinary gap data and is no longer a fixed-size door. Fully filled openings disappear. General erasing subtracts a swept brush interval from drawn walls, with one undo action per gesture; the fixed ship artwork remains protected. Render cut boundaries without caps intruding into gaps.

Room-aware resizing recognizes geometric rectangular/chamfered room outlines, including rotated rooms and split sides, without relying on how they were originally created. Dragging a long room side changes its corresponding extent and translates the adjoining chamfers without changing their size. Invalid resizes reject the entire edit. Chamfer handles and unrecognized shapes retain local constrained editing; arbitrary branched deformation is still outside this milestone.

New maps use roughness 2.25 (previous default 3), a 25% reduction; existing saved style settings remain unchanged. The Room tool's Quick Guide must name the top-bar **Rotate 45°** control and provide a direct toggle/shortcut. Large exports render bounded-height stripes into a streamed PNG so 16384 output does not require a full 1 GiB RGBA canvas. Keep existing file-size, metadata, CRC and topology validation.

Versioned JSON document: format `revola-map`, version `2`, name, width/height and originX/originY, style constants, vertices `{id,x,y}`, edges `{id,a,b,doors:[{id,t}],gaps:[{id,start,end}]}`, ship `{x,y,mirrored}`, and texture seed. The validator upgrades version 1 maps, adds empty gaps and zero origins, and preserves their saved style. Edge references use vertex IDs. Vertex coordinates and edges must be finite, in bounds, nondegenerate and horizontal, vertical or exactly diagonal. Imports must be validated before replacing current state. The renderer never imports arbitrary scripts or external asset paths from documents.

New walls are snapped to the nearest allowed ray from their start. Exact touching endpoints are merged; intersections are split into shared graph vertices where supported. Unsupported/degenerate edits must be rejected with visible feedback, never silently create forbidden angles. Doors are parametric fixed-size gaps along a wall, retained in the graph so removing a door restores the original wall. Door placement must avoid wall endpoints and overlapping cuts.

Room primitives have fixed chamfers, configurable width/height and 0/45-degree orientation. Once created they become ordinary graph edges. Corridor input is a freehand centerline quantized to eight directions; parallel boundaries maintain a measured width with mitred corners and no forbidden wall directions. Reject or explicitly limit self-overlap and sharp reversals if their geometry cannot be validated.

Connected editing must preserve shared vertices and allowed directions. A corner moves only along feasible constraint intersections; wall movement must extend adjoining walls. Never claim unrestricted network deformation if only a subset is implemented. Undo/redo stores complete validated snapshots at gesture boundaries, bounded to 100 states.

Recognized room sides first attempt shape-preserving resizing. The room's other long sides stretch, the opposite side stays fixed, and its chamfers retain their lengths. Collinear split sides and compatible attached walls are supported; invalid recognized resizes reject without a fallback that would distort the room. Ordinary movement remains local to vertices with one or two incident walls: a wall translates perpendicular to itself and neighboring joints slide along their existing wall lines; a corner moves with adjacent joints; a terminal endpoint stretches its wall. Moves causing graph collisions, clipped doors or changes to fixed airlock ports are rejected atomically. The ship anchor is fixed at (4096,4740); legacy saved pins use x ±356.5 at y0, and new wall-start handles use (-356.5,-40)/(+385.5,-40) relative to that anchor. General branched constraint propagation and dedicated detach/rejoin remain later milestones. Imported topology is checked using spatial buckets and a bounded candidate count, so disconnected crossings and collinear overlaps are rejected.

## Reference fidelity

Inspect the supplied transparent reference PNGs composited on black. Record wall thickness, clear door width, corridor width, chamfer, and anchor bounds in `REFERENCE_ANALYSIS.md`, distinguishing measurements from provisional interpretation. Use original ship pixels where a clean crop is possible; retain attribution to the supplied file and a reproducible extraction script. The anchor must mirror horizontally without changing the upper airlock connection position. Wall roughness is seeded and stable between redraws, save/load and export; it must not become grey wall fill. Antialiasing may change alpha only.

## Saving and opening

### Version 0.9 compact SVG export

**Save wall SVG** (named **Save SVG** when introduced in version 0.9) exports a self-contained transparent `.svg` at the document's native dimensions and world-origin viewBox. White wall polygons come from the shared renderer, including merged collinear runs, deterministic roughness, real door/eraser cuts and bounded miter joins. Simplify only the wall side chains with at most 0.25 map pixel deviation including coordinate rounding; preserve the exact cap endpoints and miter geometry. Straight sides retain only their necessary endpoints. Use one compact nonzero-fill wall path, no editing overlays, background, duplicate graph metadata or external resources.

Embed the bundled ship PNG once in the SVG, without further alteration during export, retaining its pixels, anchor and mirroring. The asset's bounded airlock correction is documented in [REFERENCE_ANALYSIS.md](REFERENCE_ANALYSIS.md). Avoid tracing the raster artwork into excessive vector nodes. A dedicated native bridge reads only this bundled asset; browser preview loads the same file locally. SVG is an image export, without project import or editable graph metadata. Successful SVG export therefore leaves unsaved project changes dirty; keep **Save wall PNG** and **Save project** for editable persistence. Native saves retain atomic replacement, cancellation and bounded byte validation; browser downloads use `image/svg+xml`.

PNG is the normal interchange path. Embed bounded, versioned JSON in an ancillary iTXt chunk using a namespaced keyword and validate the chunk CRC. Rasterization uses transparent clear pixels and white RGB wall pixels. The PNG contains only map content, never grid, selection, labels or black background. Report metadata size in the reference/testing notes. Also support `.revola.json` project files as a recovery/interoperability path. Plain PNGs without metadata cannot reconstruct graph topology and must return a useful message.

Native dialogs handle cancel without false success. Save/load errors leave the current document intact. Track unsaved changes and confirm replacement or exit. Browser preview uses file input/download fallback. Validate image dimensions, graph size and total import byte length before expensive processing.

## Interface

Dark desktop workspace inspired by conventional graphics editors: top File actions, narrow left tool rail, contextual options, black central canvas and right document panel. Tools: Select (V), Wall (W), Door (D), Eraser (E), Room (R), Corridor (C), Hand (H). Quick Guide sits below Document, explicitly explains **Rotate 45°**, and includes a direct rotation button; Shift+R also toggles rotation. Eraser brush diameters are 100/200/400/800 map pixels. Keep the internal workspace concise: no brand logo, welcome/example overlay, fixed-direction or wall-dimension explanation, duplicate document canvas/background/expansion notes, preview/export caption or offline/version badges. Canvas heading retains the current dimensions. Selection retains Copy/Paste/Delete actions and concise live statistics, with no idle instructions or clipboard explanation. Current tool help and error/operation feedback remain available. Scroll zoom anchors at cursor, Space+drag/middle mouse pans, F fits the map, Escape cancels an in-progress gesture. Ctrl+Z/Y, Ctrl+S, Ctrl+O follow standard conventions. Document replacement requires confirmation when unsaved; reversible drawing/erasing uses undo. Keep high contrast and named accessible controls; an empty map opens directly to the canvas and fixed airlock.

## Agent implementation protocol

1. Read this design, `CHECKLIST.md`, and reference analysis before editing related modules.
2. Claim non-overlapping modules when working concurrently and agree exported interfaces first.
3. Maintain `CHECKLIST.md` in every milestone: `[ ]` pending, `[-]` in progress, `[x]` verified. Record exact tests/evidence and known limitations; never check off a feature merely because code exists.
4. Add meaningful geometry/round-trip/import regression tests. Run `npm test`; exercise visible drawing, door placement, undo/redo, export/open, and zoom in the actual UI.
5. Preserve source references. Keep generated distributions, dependencies and generated evidence out of source control. Follow the user's authorized Git scope and [RELEASING.md](RELEASING.md) for release work; do not change repository visibility without the owner's instruction.
6. Run checks meaningful to the change: `npm test` for geometry/persistence, `npm run test:ui` for the interface, and `npm run package` followed by `npm run test:packaged` for delivery changes. At handoff, provide launch instructions, verified shortcut/package evidence and explicit deferred requirements. Do not imply the wider design is complete merely because the supported subset works.

## Acceptance checks

- All accepted graph edges follow the allowed angles, including rotated rooms and corridors.
- A door has the same clear width at every zoom and orientation and is preserved through PNG/project round trips.
- Exported pixels have transparent background, white walls and a visible mirrored/non-mirrored ship.
- Export then reopen recovers exact editable graph and style data.
- Invalid imports are bounded and rejected without losing the active document.
- Reference texture is stable; UI remains usable at typical desktop sizes.
- Packaged Windows app opens independently of the development server and successfully writes/reads a file.
