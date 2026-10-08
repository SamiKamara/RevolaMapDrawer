# Supplied map reference analysis

Measured and visually reviewed on 2026-10-06; upper airlock doorway extraction updated on 2026-10-07 and symmetric airlock correction on 2026-10-08. Sources are the unchanged root files `RevolaCandiMapASample.png` and `RevolaCandiMapBSample.png`. Measurements use original image pixels; one map unit is one reference pixel.

These references guide a specialized map tool for **Revola: Post Hyper**. Their measured style and dimensions are not a specification for a general drawing application. The source files and derived artwork were supplied for this project; this analysis records technical provenance without asserting ownership of the Revola game or third-party materials. The owner authorized this project's public distribution and selected the standard MIT License on 2026-10-08. The project's original code, documentation and assets use [MIT](../LICENSE), unless separately identified as third-party material; see [DISTRIBUTION.md](DISTRIBUTION.md) for license scope and bundled notices.

## Inspection and reproducibility

Both images are **8192 × 8192 RGBA**. Every RGB channel has extrema `(255, 255)`: the image contains white RGB throughout, and alpha defines both the transparent background and wall silhouettes. Viewing the original on white hides almost all content. The analysis previews composite the original onto black; these black previews are documentation only and must never become map exports.

From the repository root, run `python scripts/analyze-references.py` with Pillow installed to regenerate the previews, scan evidence in `docs/reference-analysis/measurements.json`, and the corrected ship asset. The original source PNGs remain unchanged. The generated `docs/reference-analysis/` directory is local verification evidence and excluded from source control; this maintained document records the relevant findings. The airlock correction reflects existing left-wall pixels and clears the exact doorway intervals; no image generation, tracing or resampling is used for `assets/ship.png`.

Locally generated and visually inspected artifacts, relative to `docs/reference-analysis/`:

- `RevolaCandiMapASample-black.png`: map A on black.
- `RevolaCandiMapBSample-black.png`: map B on black.
- `door-chamfer-detail.png`: door and chamfer at native resolution.
- `corridor-wall-detail.png`: parallel corridor walls at native resolution.
- `ship-airlock-detail.png`: original ship and airlock detail.
- `ship-prefab-detail.png`: bundled ship including both airlock doorways.
- `ship-prefab-airlock-detail.png`: bundled airlock at native resolution.

Both maps use axis-aligned and 45-degree wall segments, rooms with clipped corners, constant corridor separation, and repeated door openings. Map A has one prominent upright clipped room and a rotated room; B shows a rotated clipped room and a larger upright one. Some other rooms have square corners, so the editor should allow both manual walls and a clipped room primitive. The fixed ship outline has curved/slightly irregular portions and a thinner cockpit partition; it is a preserved asset, not a user-drawn wall network.

## Measured dimensions and chosen constants

Alpha scans classify a pixel as occupied at alpha ≥ 128. Coordinates are zero-based and intervals exclude their right or bottom bound. A one-pixel threshold or hand-drawn edge difference should not be interpreted as a new design dimension.

| Feature | Pixel evidence | Editor constant | Interpretation |
| --- | --- | --- | --- |
| Map size | Both source files exactly 8192 × 8192 | 8192 × 8192 | Native coordinate space avoids arbitrary scale conversion. |
| Wall thickness | A's left corridor, rows 2700–3400 every 25 px: 58 perpendicular wall samples, min/median/max **48/50/51** | **50** | Nominal width, with bounded edge variation. Some other walls broaden to roughly 55–59 px locally. |
| Clear door opening | A y=1400: x3911–4285 = **374**; y=2995: x3912–4286 = **374**; y=4700: x3903–4278 = **375**; x=3355: y2054–2428 = **374**; x=4750: y3965–4340 = **375** | **375** | Physical gap along a wall, including a diagonal wall; do not measure its axis projection. |
| Corridor wall-center separation | Same left corridor scan: min/median/max **579.5/581/582** | **580** | Offset the centerline route by 290 px on both sides. |
| Corridor clear width | Same scan: min/median/max **529/531/532** | **530 nominal** | Center separation minus the nominal 50 px wall thickness. Not 580 px of traversable space. |
| Room chamfer | A upper left chamfer has x+y ≈4971.5, upright center x≈3356.5 and horizontal center y≈1400.5; inferred axis inset ≈214.5 px | **220** | Approximate standardized inset; raster references are hand-shaped rather than an exact geometric specification. The diagonal length is inset × √2, not the inset itself. |
| Edge variation | Native crops show gentle longitudinal waviness and minor local edge irregularity, not grey fill | **2.25 nominal px per side** | Reduced from 3 by 25% following tester feedback in v0.2. Saved older styles remain unchanged. Keep the random seed stable. |

The corridor and chamfer constants are rounded interpretations, not claims of exact game engine configuration. The supplied instructions contain no numeric gameplay specification. The wall and door constants have stronger repeated evidence. The renderer should retain the chosen values consistently rather than copy the references' small deviations.

## Ship and airlock extraction

The two originals are pixel-identical below y=4732 (the difference image's bottom-exclusive bound is 4732). Version 0.2 cropped from y=4740, preserving the uprights and lower entrance but omitting the upper doorway. Version 0.3 included the original upper doorway from map A and masked unrelated room-wall extensions in the added 70-pixel band. The current correction makes the chamber symmetric around the two door centers by preserving its left half and widening its right half. The ship anchor, source crop and hull remain at their exact original coordinates.

- Source: `RevolaCandiMapASample.png`.
- Crop box: **[2807, 4670, 5266, 6601]**, right/bottom excluded.
- First crop and mask source rows **[4670, 4740)** to source x **[3692, 4459)**, as in version 0.3. Then apply only the airlock correction described below.
- Asset size: **2459 × 1931**, transparent RGBA, **148,236 bytes**; PNG SHA-256 **`30bcac47e18eb0f517ba2731e9cb11e4263a3c1bf8fad27e00b98c2c4bc0b804`**.
- Existing airlock anchor: native **(4076, 4740)**, now asset-local **(1269, 70)**. The new top is 70 px above the unchanged document anchor.
- The pinned graph ports remain anchor x ± **356.5** at y=0, without changing existing saved vertices. At source y=4740 the corrected occupied runs are **[3692,3747)** and **[4434,4489)**. A nominal 50 px wall at each original port overlaps these uprights by **50 px** and **23.5 px** respectively. With the corrected doorway pivot in v0.10.2 these overlaps stay the same in both orientations. Widening the raster therefore retains visible attachment without relocating the graph pins.
- Default document anchor: **(4096, 4740)**; this translates the source asset right by 20 px.
- Mirror the asset around the actual doorway center at asset x **1283.5**, which is **14.5 px** right of the legacy anchor. Version 0.10.2 uses effective mirrored translation **(4125,4740)** before horizontal reflection, keeping the doorway and existing corridor center fixed while changing the nose direction. The saved anchor and graph pins stay unchanged.
- Both doorway cuts are the exact source interval **[3903,4278)**, **375 px** wide, with center **x4090.5**. The outer nominal wall plane is **y4700**, the inner plane **y5308**. Their asset centers are **(1283.5,30)** and **(1283.5,638)**. Both orientations now retain world centers **(4110.5,4700)** and **(4110.5,5308)**. Before v0.10.2 the mirrored centers drifted left by **29 px** to x4081.5. The normal asset gap is **[1096,1471)** and a bounding-box mirrored scan gives **[988,1363)**, both exactly 375. These bounding-box scan coordinates do not define the artwork's world-space mirror pivot.

The correction is confined to source box **[3670,4670,4511,5355)**, asset-local **[863,0,1704,685)**. Reflect its left half onto its right half about source **x4090.5**, then clear **[3903,4278)** through the full corrected height. This preserves the original upper opening and the lower opening's center-plane position, removing the source's one-pixel lips at other rows so neither door narrows below 375 px. The entire corrected chamber, including its edge alpha, is exactly symmetric. The right upright moves outward about 21–30 px through its straight portion; the original left profile is retained apart from the doorway lip normalization. The ship itself is neither moved nor scaled.

Pixels outside this correction box are byte-identical to the preceding asset. In particular, source **[2807,5355,5266,6601)**, containing the hull, engines and cockpit partition, has unchanged RGBA SHA-256 **`a7092785290653205c82412db6b295fe9b246615ebba4b6c4d183c41b41db678`**. The box stops at the first row where the asymmetrical hull begins, so the original ship shape and lower doorway-to-hull connection remain intact. `reference-analysis/measurements.json` records the symmetry, both normal/mirrored door scans, pin overlap and preservation checks. The extraction asserts these properties against the untouched original; four `tests/ship-asset.test.js` regressions independently decode the bundled PNG and verify symmetry, exact door width/centers, unchanged hull/exterior hashes, pinned attachment and white RGB.

The ship asset remains fixed raster artwork. It is not included in the editable graph, and the ordinary door tool should not erase parts of the ship. The outer fixed opening can supply its precise center as a Corridor start/end target; that targeting does not turn the artwork into editable walls.

## Renderer behavior

`src/render.js` uses the same `drawMap` routine for canvas editing and transparent export. World coordinates are independent of view zoom. The routine never paints a background and uses white fill with silhouette-only edge variations. Door cuts become invisible intervals along the original graph edge, retaining its topology and metadata. From v0.3, bounded pointed miter joins replace round corner covers. Door cut endpoints receive no caps, preserving their physical width.

Wall edge variation is deterministic from the document seed, canonical world line and a fixed world-space sample lattice. Visible collinear intervals merge before painting, so edge IDs, direction, arbitrary splits and overlapping extensions produce the same continuous silhouette. All vector outlines and joins share one fill, preventing internal antialias seams. Texture approximates the source's organic edges; it does not claim pixel identity with hand-drawn walls. The ship preserves original source pixels outside the masked upper extensions and the explicitly bounded symmetric airlock correction. The script's generated JSON retains exact scan coordinates so these choices can be revisited without guessing from scaled screenshots.

The geometry layer reserves **27.25 px of solid wall between a door cut and a graph endpoint** for new maps (25 px half-width + 2.25 px edge allowance; older maps retain their saved allowance). It also rejects new intersections inside that clearance. `segmentVisibleParts` computes the exact 375 px longitudinal door gap for both axis-aligned and diagonal walls, as well as arbitrary erased intervals. This is a placement constraint, not a change to doorway width. Joins require solid incident runs; free ends and erased cut ends remain butt-ended so erasures cannot regrow a cap. The miter radius is bounded to **75 px**; drawing and movement reserve that same distance at the canvas boundary, expanding early enough to retain pointed tips.

All vector fill and the corrected asset use white RGB. Canvas antialiasing changes coverage/alpha at edges; it does not require grey wall colors. The export caller must begin with a transparent canvas and omit editing overlays. The renderer itself does not clear the surface or draw a black background. V1 import validation fixes the ship position as well as dimensions, preventing a saved anchor from placing the required artwork outside the canvas.

The renderer produces sharper bounded miters rather than tracing exact hand-drawn corner contours. Texture remains stable across collinear subdivision, repeated extension, redraw, reopen and export. Canvas antialiasing can have small alpha rounding differences when a shape is translated into export stripes; raster checks separately require fully solid interiors, transparent background and ship pixels to match the corrected bundled asset exactly. The fixed ship ports remain an attachment convention; graph editing must preserve or explicitly reject movement of vertices pinned to those ports.
