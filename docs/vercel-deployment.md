# Publish the prototype to Vercel

Import [Marvinhaemke/orbit-browser-prototype](https://github.com/Marvinhaemke/orbit-browser-prototype)
as a new Vercel project.

1. Select the repository and production branch **main**.
2. Set **Framework Preset: Other** and leave **Root Directory** at the repository root.
3. Keep the settings supplied by `vercel.json`: build `npm run build`, output
   `dist`, and no install command.
4. Deploy. No environment variables, database, API keys, or Firefox installation
   are required.

The project pins Node.js 22 and Python 3.12. Vercel's build image provides Python,
and the embedding endpoint uses its standard Python Function runtime.
See the official [build configuration](https://vercel.com/docs/builds/configure-a-build),
[build image](https://vercel.com/docs/builds/build-image), and
[Python runtime](https://vercel.com/docs/functions/runtimes/python) documentation.

## What gets deployed

`npm run build` generates 20 static assets in `dist/`: the focus interface,
themes, radial approaches, local reading pages, logo, shared radial renderer,
adapted canvas, and board validator. The same canvas adapters used by local
development generate the hosted assets.

`api/frame-policy.py` serves `/api/frame-policy`. It checks embedding headers
for public website addresses using the existing DNS validation, pinned connection,
TLS verification, and redirect checks. It returns a small JSON decision; it
does not proxy website contents or bypass embedding restrictions.

The hosted interface does not connect to local file-watch streams. The
`/health`, `/events`, and `/shutdown` development endpoints are not deployed.
Tabs, preferences and board data stay in the visiting browser's local storage.
Localhost, preview domains and the production domain have separate storage.

HTTP-only sites display the unavailable message on the HTTPS-hosted prototype.
Use HTTPS website addresses. Sites blocking frames still display the unavailable
message; header checks are advisory, and the browser enforces actual policy.

## Check the built app before deploying

With Python and Node.js installed:

```sh
npm run build
npm test
npm run test:python
npm run preview
```

Open **http://127.0.0.1:8767/**. This preview serves the generated static files and
the actual serverless handler, with no live-reload endpoint. Stop it with Ctrl+C.
The original `Prototype-Orbit.cmd` remains the fastest editing workflow.

After Vercel deployment, verify:

- Enter fullscreen, change the UI design, and cycle radial approaches.
- Open an embeddable HTTPS website, then a site that blocks frames.
- Switch between live tabs and close a tab with its explicit X.
- Open the canvas, create/edit a note, group a website card in a frame, and Peek.
- Refresh and confirm preferences, tabs and board data restore.

The local build and endpoint checks do not replace this final check on the actual
Vercel URL. No Vercel project is created or deployed by the preparation scripts.
