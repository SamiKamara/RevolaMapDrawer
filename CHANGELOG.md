# Changelog

Versions use three-part semantic versions. A dated entry describes prepared
source; it does not by itself mean that a GitHub Release has been published.

## [Unreleased]

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
