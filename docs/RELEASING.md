# Releasing Revola Map Drawer

Revola Map Drawer is a specialized offline map editor for **Revola: Post Hyper**,
not a general-purpose drawing tool. Its release process follows the local
ModularGameOverlay reference: manually prepared versions and changelog entries,
verified Windows builds, immutable version tags and GitHub Actions. This project
creates **draft releases** for owner review by default.

The public source repository is
[SamiKamara/RevolaMapDrawer](https://github.com/SamiKamara/RevolaMapDrawer).
The first public portable release is
[v0.10.2](https://github.com/SamiKamara/RevolaMapDrawer/releases/tag/v0.10.2).
The owner authorized release publication and public visibility on **2026-10-08**. Building,
tagging, creating a draft and publishing a reviewed release are separate actions;
none changes repository visibility. Future release scripts and workflows continue
to create drafts for review; they do not publish automatically.

## Delivered files

The two release assets for the selected version `0.11.0` are:

- `RevolaMapDrawer-0.11.0-win-x64.zip` — the complete portable Windows x64 folder;
- `SHA256SUMS.txt` — the SHA-256 checksum of that exact ZIP.

Extract the entire ZIP and open
`RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe`. Keep all extracted files together.
The application needs no Node.js, installer, development server or internet
connection. It is not a standalone single-file executable. Other operating systems,
Windows ARM64 packages, installers, automatic updates and Authenticode signing
are not currently provided.

The ZIP contains standalone `README.txt` instructions, `DISTRIBUTION.md`,
the project's MIT license as `LICENSE-RevolaMapDrawer.txt`,
`THIRD-PARTY-NOTICES.txt` and Electron's unchanged `LICENSE` and
`LICENSES.chromium.html`. The application archive contains only `index.html`,
runtime `src/`, `electron/`, `assets/` and a minimal `package.json`. It excludes
Git metadata, agent instructions, development dependencies, tests, original
reference PNGs, the Finnish brief, personal maps and generated test evidence.
GitHub's automatic source archives are separate from the portable application.

Read [DISTRIBUTION.md](DISTRIBUTION.md) before distribution. The project's
original code, documentation and assets use the [MIT License](../LICENSE),
unless separately identified as third-party material. Preserve its copyright
and license notice in software copies or substantial portions, and keep the
separate runtime license files unchanged. Exported maps do not need a Revola
Map Drawer credit.

## Prepare a version

1. Read `AGENTS.md`, [DESIGN.md](DESIGN.md), [CHECKLIST.md](CHECKLIST.md), relevant
   reference notes and [DISTRIBUTION.md](DISTRIBUTION.md).
2. Choose an exact three-part semantic version, with no leading zeros or
   prerelease suffix. For a later version, update both package files together:

   ```powershell
   npm version 0.11.1 --no-git-tag-version
   ```

3. Move accepted release changes from `[Unreleased]` into one populated dated
   changelog entry with this exact format: `## [0.11.1] - YYYY-MM-DD`. Preserve
   an `[Unreleased]` section for subsequent changes. Do not invent verification
   results or imply a prepared version is already published.
4. Validate the metadata and build the complete release locally using the actual
   selected version:

   ```powershell
   npm run release:check -- --version 0.11.1
   .\scripts\build-release.ps1 -Version 0.11.1
   ```

5. Record actual milestone evidence and limitations in `docs/CHECKLIST.md`.
   Inspect and launch the real desktop test shortcut as required by `AGENTS.md`.
   Close only your own test instances; preserve any open user map before a
   rebuild. If source or distribution notices change, rebuild the package.
6. Commit the complete preparation on `main` and push `main` when authorized.
   Confirm clean local `main` exactly matches `origin/main` before tagging.

The current selected package and lockfile version is `0.11.0`. The `0.11.1`
examples above illustrate a later patch; version selection remains manual.
Do not bump versions automatically merely to exercise this pipeline.

## Build assets without a tag or GitHub Release

Building requires Windows x64, Node.js **22.12.0 or newer**, npm and the pinned
dependencies in `package-lock.json`. GitHub Actions uses Node.js 24. A local build
does not require a clean Git worktree or any existing tag:

```powershell
.\scripts\build-release.ps1 -Version 0.11.0
```

Output is written to `artifacts\release\v0.11.0`. An optional `-OutputDirectory`
must point to a child of the repository's `artifacts\release` directory. The
builder refuses junction/symlink output paths before clearing its generated
output. It never deletes source directories or creates a Git tag.

The builder runs `npm ci`, `npm test`, `npm run test:ui`, `npm run package` and
`npm run test:packaged`. It checks runtime bytes and the packaged version against
current source, creates the ZIP and checksum, compares every ZIP file to the
verified package, extracts the ZIP and runs `npm run test:portable` against that
extracted application. The portable check uses the extracted folder as its
working directory and verifies the offline UI plus native project save/reopen.
Generated `release-notes.md` is retained locally and supplies the draft body; it
is not uploaded as an extra release asset.

Local `npm run package` retains its automatic `postpackage` desktop-shortcut
refresh. On hosted CI only, the release wrapper uses
`npm run package --ignore-scripts`: the maintained package command still runs,
while npm skips the machine-specific `postpackage` shortcut hook. No hosted
runner desktop shortcut is created. Geometry and UI checks are not skipped.

The floor smoke tests always run their maintained generated fixtures. An
additional private complex-map regression can be selected with
`REVOLA_FLOOR_FIXTURE` pointing to the read-only fixture described in previous
milestone evidence. Its fixed probes require that particular fixture; this is
not a generic import-test option. A configured missing or invalid fixture fails
clearly. Without it, evidence explicitly records that the optional case was not
configured; CI coverage does not silently depend on a developer's desktop.

## Create and push the version tag

Only do this when release tagging/pushing is authorized. From clean, synchronized
`main`:

```powershell
.\scripts\create-release.ps1 -Version 0.11.0 -Push
```

The script validates the package and lockfile version, populated dated changelog,
canonical `origin`, current branch, all tracked/untracked changes, freshly fetched
`origin/main` and absence of the local/remote tag. It captures the intended commit,
builds and verifies the full release, then rechecks the same commit, clean source,
remote main and packaged source before creating the annotated tag.

Without `-Push`, it creates only a local annotated tag and prints the exact tag
push command. `-Push` pushes only that tag; it does not push a branch or create a
pull request. Pushing `vMAJOR.MINOR.PATCH` triggers the **Build release** workflow,
which rebuilds and verifies the tagged source before creating a draft.

Never move, delete or recreate a version tag. Correct a released version with a
new patch version. The draft upload script also refuses to overwrite a published
release's assets or notes.

## Verify GitHub Actions without creating a release

The **Verify application** workflow runs Windows source/UI/packaged checks for
`main` pushes and pull requests, with repository contents read permission only.

The **Build release** workflow can also build current `main` without a tag or
draft. This is the default manual invocation:

```powershell
gh workflow run release.yml --ref main
gh run list --workflow release.yml --limit 5
gh run watch RUN_ID --exit-status
gh run download RUN_ID --name RevolaMapDrawer-0.11.0-win-x64
```

Use the real run ID returned by `gh run list`. This path leaves the verified ZIP,
checksum and notes as an Actions artifact for inspection for 14 days. It creates
no release and no tag. GitHub CLI must be authenticated with permission to run
workflows in this repository.

To rebuild an existing version tag for inspection without uploading a draft:

```powershell
gh workflow run release.yml --ref main -f tag=v0.11.0
```

To explicitly create or refresh a draft from that existing tag:

```powershell
gh workflow run release.yml --ref main -f tag=v0.11.0 -f create_draft=true
```

The workflow validates tag/version/changelog agreement and requires the tagged
commit to be in `main` history. The scoped `GITHUB_TOKEN` supplies repository
contents write permission to the release job; no extra repository secret or
personal access token is required. Manual input is passed through environment
variables and validated before checkout. Draft upload uses `--verify-tag` so
GitHub CLI cannot create an accidental tag.

## Upload a locally verified draft

When authorized, GitHub CLI can upload the same verified assets from an exact
tagged checkout:

```powershell
.\scripts\publish-release.ps1 -Version 0.11.0
gh release view v0.11.0 --repo SamiKamara/RevolaMapDrawer
```

This requires a clean worktree, canonical `origin`, local and remote tags pointing
to `HEAD`, matching current packaged source, a valid ZIP checksum and byte-equal
ZIP contents. A new release is always created with `--draft --latest=false
--verify-tag`. An existing draft's exact two assets may be replaced after the
same verification. Published releases are rejected. Failed commands leave a
draft or local tag available for inspection; they do not automatically publish it.

## Publish a reviewed draft

An owner can explicitly authorize an agent to publish a reviewed draft. After
confirming the intended tag, assets, checksums, release notes and distribution
status, the publication command is:

```powershell
gh release edit v0.11.0 --repo SamiKamara/RevolaMapDrawer --draft=false
```

Run it only for the explicitly approved version after the draft and its assets
have been verified. Scripts and workflows do not execute this publication step.
Publishing a release does not change repository visibility; any future visibility
change still requires the owner's separate instruction.

## Check a downloaded ZIP

Place the ZIP and `SHA256SUMS.txt` in the same folder, then run:

```powershell
$assetName = 'RevolaMapDrawer-0.11.0-win-x64.zip'
$actual = (Get-FileHash -LiteralPath $assetName -Algorithm SHA256).Hash.ToLowerInvariant()
$line = Get-Content -LiteralPath SHA256SUMS.txt |
    Where-Object { $_ -match "  $([regex]::Escape($assetName))$" }
if (@($line).Count -ne 1) { throw 'Expected exactly one ZIP checksum entry.' }
$expected = $line.Split(' ')[0]
if ($actual -ne $expected) { throw 'Checksum mismatch.' }
Write-Host "Checksum verified: $actual"
```

Change the version in `$assetName` to match the selected release. Extract only
after successful verification. Checksums detect a changed download; they do not
replace publisher signing or the owner's source/artwork review.

GitHub CLI's relevant documented behavior is in
[release create](https://cli.github.com/manual/gh_release_create) and
[release edit](https://cli.github.com/manual/gh_release_edit).
