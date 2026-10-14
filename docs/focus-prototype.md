# Focus-mode website prototype

Run `Prototype-Orbit.cmd` from the repository. It starts a reusable, hidden local
server and opens **http://127.0.0.1:8766/**. Select **Enter fullscreen** to use
the browser's actual Fullscreen API. Escape exits fullscreen. The prototype can
also run in a normal window or the Codex browser panel.

```powershell
Prototype-Orbit.cmd
Prototype-Orbit.cmd status
Prototype-Orbit.cmd stop
# A different port, if needed:
Prototype-Orbit.cmd --port 8767
# Start without opening another browser tab:
py -3 scripts/prototype.py start
```

The launcher finishes after startup; closing its console leaves the server and
browser page running. `stop` stops only this checkout's managed prototype server.
To run with a visible log instead, use
`python scripts/prototype_server.py` and stop that foreground server with Ctrl+C.

## Interactions

- Top middle: compact address island. Click to expand and type a website URL.
  Tabs and new-tab buttons live in this island.
- Top left: quarter tools menu with local submenu fans and pie-slice selection.
- Top right: pause, fullscreen, and leave-focus controls. These are prototype
  actions; a website cannot operate native OS minimize and close commands.
- Right edge: reveal the grouped tab wheel. Its X buttons close individual tabs.
- **Alt+L** address, **Alt+T** new tab, **Alt+Q** tab wheel, **Alt+S** settings.
  Browser-reserved shortcuts remain with the host browser.
- Right-click on the workspace or local reading pages: page actions. Hold the
  right mouse button and release over a tab to switch or over its X to close.
  A group expands into a local fan; arrow keys, Enter, Delete, and Escape work
  through the shared radial renderer.

Settings changes light/dark/system appearance, UI design, hover dwell, the current tab's
frame, and Design/Browse interactions. Tabs group by frame and then by exact
hostname, without creating native host-browser tab groups. The all-tabs list
provides another way to select and close many tabs. Reopen a closed tab from
Tools → Tabs.

## Compare UI designs

Choose a design on the welcome screen, in **Settings → UI design**, or from the
corner menu's **Appearance** fan. **Alt+Shift+D** cycles the four designs without
reloading the current page. **Alt+S** opens Settings. Each design supports light,
dark, and system appearance; your selection is remembered across refreshes.

| Design | Direction |
| --- | --- |
| Liquid | Sculpted mineral surfaces, soft corners, cyan accents |
| Glass | Translucent islands, violet light, rounded cards, lighter typography |
| Paper | Warm ink and cream, editorial serif headings, flat surfaces, fine lines |
| Studio | Compact controls, monospaced type, mint accents, outlined pie sectors |

The designs change workspace, address/window islands, dialogs, and radial menus.
Pie-slice targets, tabs, and gesture behavior stay consistent so you can compare
appearance without relearning navigation. A design switch keeps the iframe and
its in-page state alive.

## Compare radial approaches

**Settings → Radial approach** changes menus independently of the UI design.
Choose **Try this menu**, or right-click a page or the canvas, then press
**Alt+Shift+R** to cycle approaches while the same menu stays open. Selection is
remembered across refreshes. The quarter tools menu, page actions, tab wheel and
canvas actions all use the selected approach.

| Approach | What to compare |
| --- | --- |
| Soft | Existing sculpted disc and circular hover highlights |
| Slices | Filled pie wedges make the entire action target visible |
| Halo | Quiet icon ring, labels on exploration; tab names remain visible |
| Petals | Separate floating button surfaces, without the surrounding disc |
| Type | Words lead; serif labels and a flat surface replace most icons |

All approaches retain pie-slice hit areas, explicit tab-close targets, keyboard
navigation and locally fanned submenus. Presentation changes do not rebuild the
menu's data or reload pages. Solid surfaces keep page content from competing
with menu text. These are website experiments; no fork styles are changed.

## Canvas

Open **Canvas** from the top-left tools menu, choose **Open your canvas** on the
workspace, press **Alt+C**, or enter `orbit:canvas` in the prototype address field.
The canvas reuses the fork's HTML, CSS and JavaScript through a local server
adapter, with its native browser bridge replaced by prototype tab/storage APIs.
Its board schema validation is shared from the native source.

- Drag website cards and note headings. Drag frame headings to move a group.
- **N** places notes, **F** draws frames, **C** connects cards, **D** draws.
  **Space + drag** pans, **Ctrl + scroll** zooms, and **Ctrl+Z** undoes.
- Right-click blank space or a card for canvas actions using the selected radial
  approach. **Remove** removes a canvas object; the website tab stays open.
- **Add tab** opens a real prototype tab and adds its card. **Import open tabs**
  collects current website tabs. Internal workspace/canvas tabs are excluded.
- Drag cards into frames or draw a frame around them. Frame titles become groups
  in the prototype tab wheel; renaming a frame updates that group.
- **Open** selects the real prototype tab. **Open frame** opens or reuses its tabs.
  **Peek** and **Compare** both preview a live website beside the canvas in this
  simulator; blocked embedding displays the unavailable-site message.

Board layout, notes, drawings, connections and camera are saved separately in
`orbit.focus-lab.v1.canvas`. The native Orbit profile and its workspace remain
untouched. Removing a canvas card leaves its prototype tab open. Refresh restores
the board and tab/frame assignments; the undo stack lasts for the current page.

## Real websites and prototype boundaries

Website tabs use real browser iframes, not screenshots or a simulated page
renderer. Switching tabs keeps their documents alive, including scroll position
and in-page form state. Only closing, reloading, or navigating a tab recreates its
document. Submitted URLs, tab selection and frame assignments survive a page
refresh in the `orbit.focus-lab.v1` local-storage namespace. Site form contents
and scroll state are not persisted across refreshes.

Sites can prohibit embedding using `frame-ancestors` or `X-Frame-Options`.
The local server performs an advisory header check and displays **“This site is
unavailable in the prototype”** when those headers reject the prototype. The
browser still enforces the site's actual policy. Headers can differ for HEAD
requests, login states, or later navigations, so **Tools → Settings → Page unavailable** provides
the same message when the browser cannot report a blocked frame to its parent.
No new native browser tab is opened for an unavailable site. Website embedding
policies remain enforced. See [MDN's frame-ancestors reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

Cross-origin pages own their pointer and keyboard events. The prototype cannot
intercept events inside those documents, inspect clicked links, read later
navigation URLs, or implement privileged native extension popups.

**Design mode** is the default for new preferences. It keeps Orbit right-clicks
and right-hold gestures available across pages by placing a transparent gesture
layer over external websites. That layer blocks ordinary website clicking and
scrolling. Switch to **Browse** in the address island, press **Alt+G**, or turn off
**Design interactions** in Settings to interact with the website normally; its
own context menu then applies. The chosen mode is saved across navigation and
refreshes. Existing saved preferences are honored.

Local reading pages need no overlay: their pointer and context-menu handlers
reconnect after every document load. Navigating from a local page to an external
site automatically enables the layer in Design mode; returning reconnects direct
handlers. The workspace and unavailable-site message are never covered.

The address shows the URL opened through the prototype; it tracks local fixture
navigation, but cannot claim to track cross-origin links. Back/forward controls
cover prototype-submitted URL history. This keeps the browser security boundary
visible instead of pretending to provide the fork's privileged APIs.

## Fast iteration

Edit `prototype/focus/styles.css`, `designs.css`, `app.mjs`, or `index.html`.
The server batches file changes and reloads the page automatically; no build,
bootstrap, package, or updater runs. Prototype tab URLs are restored after reload.
Restart the server after changing Python server code.

The prototype imports the real `OrbitRadialView.sys.mjs`, native radial CSS, and
Orbit SVG through narrow `/native/` routes. Radial geometry, hit testing, local
fans, pagination, close targets, and keyboard navigation stay shared with the
fork. A small adapter translates webpage pointer coordinates and accessibility
clicks. Prototype-only appearance overrides live in its stylesheet. Editing
shared native assets also reloads the prototype; those edits still need native
Firefox verification before acceptance into the fork.

This standalone repository keeps those seven source assets under `vendor/orbit/`.
It requires no Firefox checkout or installed Orbit browser. The local server's
native routes resolve only to these vendored files; prototype changes do not
write back to the fork.

Menu experiments live in `menus.css`; canvas appearance overrides live in
`canvas-skin.css`, and the browser adapter in `canvas-host.mjs`. Native canvas
assets are adapted in memory by `scripts/prototype_server.py`. Restart that server
after changing its adapters. Shared canvas source edits also trigger live reload.

```powershell
node --test tests/prototype-model.test.mjs tests/prototype-interactions.test.mjs tests/radial-view.test.mjs
py -3 -m unittest discover -s tests -p test_prototype_server.py -v
```

On 9 October 2026 browser checks confirmed native fullscreen (`:fullscreen`),
external example.com rendering, independent live tabs, radial frame expansion,
tab switching with textarea state preserved, explicit background-tab closing,
YouTube's unavailable-site message, and stable address width while typing.
Light and dark prototype captures are in `test-results/focus-prototype/`.
These verify the website prototype; they do not establish native Firefox-fork
or release readiness.

On 10 October 2026 browser checks compared all four designs in light and dark
appearance, confirmed design cycling preserves a local page's textarea content,
and verified the Orbit right-click menu after local-to-local and local-to-external
navigation. Browse mode removed the external-page layer, and design/mode choices
survived refresh. Fullscreen remained active during comparison. Captures are in
`test-results/focus-prototype/designs/`.

Additional checks on 10 October 2026 exercised five menu approaches over a real
website and the shared canvas. Canvas checks covered editable notes, frame
drawing and renaming, tab-wheel grouping, dragging, connections, freehand drawing
and undo, live website preview, selecting an existing website tab, and restoring
board state after reload. Captures are in `test-results/focus-prototype/menus/`.
