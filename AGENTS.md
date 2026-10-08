# Revola Map Drawer

- Read `docs/DESIGN.md`, `docs/CHECKLIST.md` and relevant reference notes before changing the implementation. The original Finnish brief and both source PNGs remain unchanged.
- Keep the interface English and the application offline. The native app loads bundled files without a development server.
- Preserve the 8192 default canvas and centered automatic expansion to 16384, measured wall/door/corridor dimensions, shared graph topology, 45-degree directions, white wall pixels, transparent export and pinned ship ports. Expanded maps retain the original world center and geometry scale.
- Update `docs/CHECKLIST.md` with verified progress and exact limitations at each milestone. Do not mark unverified features complete.
- Run meaningful geometry/persistence checks with `npm test`, UI checks with `npm run test:ui`, and packaged verification with `npm run package` then `npm run test:packaged` when delivery behavior changes.
- `Start-RevolaMapDrawer.cmd` prefers the packaged app. Rebuild it after source changes before handing a milestone to the user; otherwise the launcher opens stale code.
- Work on non-overlapping files when delegating. Do not edit the originals or commit generated artifacts, dependencies or distributions.

## Mandatory desktop test shortcut

- As soon as the project has a meaningfully testable version, create the desktop shortcut `RevolaMapDrawer - testattava versio.lnk` in the current user's Windows desktop directory, resolved with `[Environment]::GetFolderPath('DesktopDirectory')`. Treat it as a required part of every completed milestone handoff thereafter.
- The shortcut must point directly to the newest working packaged executable at `<repository root>\dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`, with no arguments and the repository root as its working directory. No separate machine-only launcher is needed for this direct executable target.
- Rebuild the packaged application after source changes before handing off a milestone. `npm run package` must refresh the shortcut automatically through its `postpackage` hook. `npm run shortcut` repairs or recreates it after a checkout move and requires the packaged executable to exist.
- At every milestone handoff, inspect the actual `.lnk` target, arguments and working directory; confirm every referenced local path exists; launch the actual shortcut far enough to verify the application UI opens; and verify the package contains the latest supported source changes. Record that evidence in `docs/CHECKLIST.md`.
- Refresh the shortcut whenever the checkout location, packaged executable path or supported launch flow changes. Its target must remain the newest working testable build between milestones.
- Keep the generated `.lnk` outside the repository. It is machine-only and must never be added to Git, a commit, or a remote repository. The maintained shortcut creation script belongs in the repository; the shortcut itself does not.
- If there is not yet a meaningfully testable version, say so explicitly in the milestone notes instead of creating a misleading shortcut or claiming test availability.

## Release preparation and distribution

- Read `docs/RELEASING.md`, `docs/DISTRIBUTION.md` and `CHANGELOG.md` before release work. This is a specialized tool for **Revola: Post Hyper**, not a general-purpose drawing application; preserve that scope in release descriptions.
- Keep version selection manual. `package.json`, `package-lock.json`, the populated dated changelog heading and `vMAJOR.MINOR.PATCH` tag must agree. Never create a tag merely to test the pipeline.
- Use `scripts/build-release.ps1 -Version VERSION` to build and verify the complete Windows x64 portable ZIP, SHA-256 checksum and extracted application's offline save/reopen behavior without creating a tag or release. Keep release output under ignored `artifacts/release/`.
- When tagging/pushing is authorized, use `scripts/create-release.ps1 -Version VERSION [-Push]` from clean `main` exactly matching freshly fetched `origin/main`. It guards the canonical repository, original commit, package bytes and absent local/remote tags. Never move, delete or recreate version tags.
- Scripts and the tag workflow create draft releases only. `scripts/publish-release.ps1` refuses published-release replacement. Publishing an owner-reviewed draft later requires explicit authorization for that version; use the command documented in `docs/RELEASING.md` only after that authorization.
- Keep the repository private until the owner separately requests a visibility change. Preparing source, tags or a draft does not authorize making the repository public. Review the documented application/artwork licensing status before public distribution.
- Production packaging uses the maintained runtime allowlist and a minimal app manifest. Preserve Electron's bundled licenses and notices. Do not include agent instructions, `.git`, `.github`, dependencies, test output, personal maps, original reference PNGs or the Finnish brief in the portable application.
- `npm run package` must continue refreshing the local desktop test shortcut. Only the release wrapper's hosted-CI path may use `--ignore-scripts` to skip that machine-specific postpackage hook; it must retain geometry, UI, package and portable archive verification.
