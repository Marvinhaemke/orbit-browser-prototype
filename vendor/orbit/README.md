# Shared Orbit source assets

These seven files are copied from the development working tree of
[Marvinhaemke/orbit-browser](https://github.com/Marvinhaemke/orbit-browser).
They include unpublished UI refinements as of 14 October 2026; the base Git
revision is context, not a claim that the files match that commit.

`sources.json` records each original repository-relative path and its SHA-256
hash. The assets are licensed under MPL 2.0; see the repository's LICENSE and
the retained source notices.

- `OrbitRadialView.sys.mjs`: shared renderer, layout and interaction geometry.
- `Orbit.sys.mjs`: source for the board schema validator. Only its pure
  validation functions are exposed by the prototype server; native browser APIs
  are not executed.
- `orbit.html`, `orbit.js`, `orbit.css`: the packaged spatial canvas.
- `orbit-radial.css`: shared radial styling.
- `orbit.svg`: Orbit logo.

The server changes import/asset paths and bridges canvas actions to prototype
tabs/storage in memory. Edit prototype overrides for experiments. To update
these files from the fork, copy them deliberately, update the hashes, and run
the focused checks.
