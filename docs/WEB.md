# Browser build and Vercel deployment

The browser application is the same specialized **Revola: Post Hyper** editor as the native Windows application. Geometry, world coordinates, ship artwork, project schema and transparent exports are shared. The Windows package remains independently runnable from bundled files.

Production: [revolamapdrawer.vercel.app](https://revolamapdrawer.vercel.app).

## Build and verify

Use the pinned dependencies with Node.js 22.12.0 or newer:

```powershell
npm ci
npm run build:web
npm run test:web
```

The local web smoke check serves only the generated directory with production-equivalent headers and measures host response bodies in a fresh Chrome profile. To repeat the focused check against the published application:

```powershell
npm run test:web -- --url https://revolamapdrawer.vercel.app
```

The generated `web-dist/` directory contains only the browser runtime and project license. It excludes Electron, development dependencies, agent instructions, original reference PNGs, the Finnish brief, personal maps and test evidence. Build metadata and screenshots remain in ignored `artifacts/`. `vercel.json` selects the static Other framework, the maintained build command and this output directory; Electron's runtime download is skipped during the hosted dependency installation.

## Local files and offline use

Open uses a local file input. Project/PNG/SVG save uses a browser download generated entirely on-device. There are no application API calls, map uploads, accounts or analytics. Download completion and destination cannot be verified by the editor, so downloads do not clear the unsaved-change reminder. Save editable projects or wall PNGs before closing; application caching does not save map edits.

A service worker installed over HTTPS or localhost stores the editor shell and ship. Repeat loads use this local cache. The optional 69,321-byte star PNG is fetched only when a closed map first needs it, then cached locally. If its first use is offline, the editor uses its ordinary background; floor detection/export still work. Reconnecting retries the background. Private browsing, cache eviction or clearing site data can remove offline availability.

The worker caches only known application resources. It waits for old editor tabs to close before switching versions, preserving the running editor's source. Reopen online to discover updates. The browser may periodically revalidate the small worker script; this is the remaining update-check traffic. A first visit and a new application version still require downloading their application files. Files with unchanged content keep their asset URLs across builds.

## Transfer budget

Minified JavaScript/CSS and byte-preserved PNGs use content-hashed filenames with `Cache-Control: public, max-age=31536000, immutable`. HTML and the worker revalidate for updates. The service worker serves repeat/offline navigation locally. There are no large reference maps or Electron binaries in the browser build. No external fonts, analytics or hosted export/download endpoints are used.

This extends the [SSEBPRC reference](https://github.com/SamiKamara/SSEBPRC)'s local file processing approach. Its calculation code/data load after valid file selection; this editor needs its geometry at startup, so its small complete runtime is bundled for immediate editing and offline exports. Only the optional background is deferred. Vercel CDN hits still count as user-facing transfer; browser caching is what prevents repeated payload delivery. See [Vercel's CDN usage documentation](https://vercel.com/docs/manage-cdn-usage) and [Cache-Control documentation](https://vercel.com/docs/caching/cache-control-headers).

The verified build's conservative first-visit body estimate is **192,573 bytes** with Brotli text and byte-preserved PNGs, or **207,615 bytes** with gzip text. This includes the initial offline installation's extra HTML request. The local measured Brotli transfer agrees: **192,573 bytes**, followed by **zero host resource requests** on a controlled reload. The optional star image adds **69,321 bytes** once. Tiny browser worker update checks can still occur independently of drawing; observed revalidation returned 304 with no response body.

Further build sizes, real network accounting and deployment evidence are recorded in [CHECKLIST.md](CHECKLIST.md). These are response-body figures, not an account quota guarantee; negotiated compression, HTTP headers, service-worker checks and browser cache behavior affect actual usage.

## Deploy

The local Vercel link is stored in ignored `.vercel/`, outside the deployed runtime. With the owner's authenticated Vercel CLI:

```powershell
vercel link --yes --scope samikamaras-projects --project revolamapdrawer
vercel deploy --prod --yes
```

Deploy from the repository root so the maintained build command/configuration is used. `.vercelignore` restricts uploaded build inputs and excludes personal/generated/native-only material. Do not use `--public`, which exposes deployment source. Vercel publication is separate from GitHub version tags and native release publication; it does not change the repository's visibility or publish a Windows release. Commit/push source updates to `main` when authorized. The current deployment flow is manual through the Vercel CLI; a Git push alone does not deploy the application.
