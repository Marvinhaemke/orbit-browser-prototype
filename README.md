# Orbit Browser Prototype

A working website simulation of [Orbit Browser](https://github.com/Marvinhaemke/orbit-browser)'s focus mode. Use it to explore navigation, radial menus and the spatial canvas without compiling Firefox.

Real websites open in iframe tabs. The prototype uses the host browser's actual fullscreen mode and saves its own tabs, preferences and canvas locally.

## Run locally

**Hosting:** the repository is also prepared for Vercel. Import it with the
**Other** framework preset and repository root; the committed configuration
supplies the build and output settings. [Deployment guide](docs/vercel-deployment.md).

Requires **Python 3.10+**. No Firefox checkout, MozillaBuild, npm install, or build step is needed.

```powershell
git clone https://github.com/Marvinhaemke/orbit-browser-prototype.git
cd orbit-browser-prototype
.\Prototype-Orbit.cmd
```

The Windows launcher starts a persistent local server and opens **http://127.0.0.1:8766/**. Click **Enter fullscreen** to begin. Closing the launcher console leaves the prototype running.

On macOS/Linux, or for a foreground server:

```sh
python3 scripts/prototype_server.py
```

Windows server controls:

```powershell
.\Prototype-Orbit.cmd status
.\Prototype-Orbit.cmd stop
# If another checkout already uses port 8766:
.\Prototype-Orbit.cmd --port 8767
```

## Explore

- Touch the top middle for the address island, top left for the quarter tools menu, or right edge for grouped tabs.
- Choose **Liquid**, **Glass**, **Paper**, or **Studio** in Settings. **Alt+Shift+D** cycles UI designs.
- Compare **Soft**, **Slices**, **Halo**, **Petals**, and **Type** radial approaches independently of the UI design. **Alt+Shift+R** cycles approaches while the menu is open.
- **Alt+L** address, **Alt+T** new tab, **Alt+Q** tab wheel, **Alt+S** settings, **Alt+C** canvas.
- Right-click for page/canvas actions. On pages, right-hold and release over a tab to switch; its X closes it.
- The canvas supports movable cards, editable notes, frames, connections, drawing, pan/zoom, undo and live website previews. Canvas frames also group tabs in the radial wheel.

**Design mode** captures Orbit gestures over external websites. Switch to **Browse** in the address island or with **Alt+G** to allow the site's own clicks, scrolling and context menu. Websites that prohibit embedding display an unavailable-site message.

The simulator cannot inspect later cross-origin navigation or provide native extension/OS privileges. Your everyday browser profile and native Orbit workspace are not modified.

## Iterate and verify

Edit files under `prototype/focus/`. The server batches edits and reloads automatically. Tabs, preferences and canvas layout are restored; iframe form/scroll state and canvas undo history last only for the current page.

Requires **Node.js 20+** for the JavaScript checks:

```sh
node --test tests/prototype-model.test.mjs tests/prototype-interactions.test.mjs tests/radial-view.test.mjs
python -m unittest discover -s tests -p test_prototype_server.py -v
```

[Full workflow and prototype boundaries](docs/focus-prototype.md).

To check the hosted build locally, run `npm run build`, `npm test`,
`npm run test:python`, then `npm run preview`. Python is used to generate the
shared canvas assets and run the embedding check; no external packages are needed.

## Shared Orbit code

`vendor/orbit/` contains the required source assets from Orbit's development working tree. The local server adapts the canvas's browser bridge in memory; the source assets remain intact. Radial geometry and board validation use the shared source.

[Vendor provenance](vendor/orbit/README.md) records the originating repository and content hashes. These prototype checks do not establish native Firefox or release readiness.

Licensed under the [Mozilla Public License 2.0](LICENSE).
