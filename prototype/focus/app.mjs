import {OrbitRadialView} from "/native/radial-view.mjs";
import {HOME, CANVAS, STORAGE_KEY, newTab, navigateTab, travelTab, closeTab, restoreSession, tabTree, titleFor} from "./model.mjs";
import {DESIGNS, MENU_STYLES, prototypePreferences, needsGestureLayer} from "./preferences.mjs";
import {observeFrame} from "./frame-events.mjs";
import {createCanvasHost} from "./canvas-host.mjs";

const $ = id => document.getElementById(id);
const element = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, action, cls = "") => {
  const node = element("button", cls, label); node.type = "button";
  node.addEventListener("click", action); return node;
};
const safeRead = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ } };
let session = restoreSession(safeRead(STORAGE_KEY));
if (!session) { const first = newTab(); session = {tabs: [first], selected: first.id, closed: []}; }
let prefs;
try { prefs = JSON.parse(safeRead(`${STORAGE_KEY}.settings`)) || {}; } catch { prefs = {}; }
prefs = prototypePreferences(prefs);
const pageNodes = new Map();
const media = matchMedia("(prefers-color-scheme: dark)");
let screenOrigin = {x: 0, y: 0};
class PrototypeRadialView extends OrbitRadialView {
  _toViewport(point) {
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) return point;
    return {x: point.screenX - screenOrigin.x, y: point.screenY - screenOrigin.y};
  }
  _mount() {
    super._mount();
    if (this.accessiblePanel === this.panel) return;
    this.accessiblePanel = this.panel;
    this._listen(this.panel, "click", event => {
      if (!event.isTrusted || event.detail !== 0 || this.model?.passthrough) return;
      const target = event.target.closest("[data-orbit-id]");
      if (!target) return;
      if (target.id === `${this.idPrefix}-center`) { this._activate(this.model.centerItem, event); return; }
      const depth = Number(target.dataset.orbitDepth), index = Number(target.dataset.orbitIndex);
      const parent = this.rings[depth]?.[index];
      const close = target.classList.contains("orbit-radial-tab-close");
      const node = close ? parent?.closeAction : parent;
      if (!node) return;
      this.active = {node, parent: close ? parent : undefined, close, depth, index};
      this._activate(node, event);
    });
  }
}
const view = new PrototypeRadialView(window, {idPrefix: "orbit-prototype"});
for (const type of ["pointermove", "pointerdown"]) window.addEventListener(type, event => {
  screenOrigin = {x: event.screenX - event.clientX, y: event.screenY - event.clientY};
}, true);
const timers = new Map();
let toastTimer, gesture = null, mode = null, launched = false;
const current = () => session.tabs.find(tab => tab.id === session.selected);
let canvasHost, canvasAction, previousPage = null;
const save = () => { safeWrite(STORAGE_KEY, JSON.stringify({tabs: session.tabs, selected: session.selected})); canvasHost?.notifyTabs(session.selected); };
const savePrefs = () => safeWrite(`${STORAGE_KEY}.settings`, JSON.stringify(prefs));
function toast(text) {
  $("toast").textContent = text; $("toast").classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4200);
}
function setTheme() {
  document.documentElement.dataset.theme = prefs.theme === "system" ? (media.matches ? "dark" : "light") : prefs.theme;
  $("theme").value = prefs.theme;
  canvasHost?.syncAppearance();
}
media.addEventListener("change", setTheme); setTheme(); $("dwell").value = prefs.dwell;
function setDesign(id, announce = false) {
  const design = DESIGNS.find(item => item.id === id);
  if (!design) return;
  prefs.design = id; document.documentElement.dataset.design = id;
  $("welcome-design").value = id;
  $("design-description").textContent = design.description;
  for (const option of $("design-grid").querySelectorAll("button")) option.setAttribute("aria-pressed", String(option.dataset.design === id));
  savePrefs();
  canvasHost?.syncAppearance();
  if (announce) toast(`${design.name} design · Alt+Shift+D to compare the next design.`);
}
for (const design of DESIGNS) {
  const option = button("", () => setDesign(design.id), "design-option");
  option.dataset.design = design.id;
  option.setAttribute("aria-label", `${design.name} design`);
  const preview = element("span", "design-swatch"); preview.setAttribute("aria-hidden", "true");
  preview.append(element("span", "swatch-island"), element("span", "swatch-orbit"), element("span", "swatch-lines"));
  option.append(preview, element("b", "", design.name)); $("design-grid").append(option);
}
$("welcome-design").addEventListener("change", () => setDesign($("welcome-design").value));
setDesign(prefs.design);
function setMenuStyle(id, announce = false) {
  const style = MENU_STYLES.find(item => item.id === id);
  if (!style) return;
  prefs.menuStyle = id; document.documentElement.dataset.menuStyle = id;
  $("menu-description").textContent = style.description;
  for (const option of $("menu-style-options").querySelectorAll("button")) option.setAttribute("aria-pressed", String(option.dataset.menuStyle === id));
  savePrefs();
  if (announce) toast(`${style.name} menus · Alt+Shift+R to compare.`);
}
for (const style of MENU_STYLES) {
  const option = button(style.name, () => setMenuStyle(style.id), "menu-choice");
  option.dataset.menuStyle = style.id; option.setAttribute("aria-label", `${style.name} menus`);
  $("menu-style-options").append(option);
}
setMenuStyle(prefs.menuStyle);
$("gesture-toggle").checked = prefs.gestures;

function updateGestureLayer() {
  const record = pageNodes.get(session.selected);
  $("gesture-layer").hidden = !needsGestureLayer({designMode: prefs.gestures,
    hasFrame: current().url !== CANVAS && !!record?.node.querySelector("iframe"), frameAccessible: !!record?.frameAccessible});
  document.documentElement.dataset.interactionMode = prefs.gestures ? "design" : "browse";
  $("interaction-mode").textContent = prefs.gestures ? "Design" : "Browse";
  $("interaction-mode").setAttribute("aria-pressed", String(prefs.gestures));
  $("interaction-mode").setAttribute("aria-label", prefs.gestures ? "Switch to website interaction" : "Switch to design interaction");
  $("interaction-mode").title = prefs.gestures ? "Design mode: Orbit right-clicks on every page. Click to browse the website." : "Browse mode: website interactions. Click to restore Orbit right-clicks.";
}

function addTab(url = HOME, frame = "", {background = false} = {}) {
  try {
    if (session.tabs.length >= 60) { toast("Close a few prototype tabs before adding more."); return; }
    const tab = newTab(url, frame); session.tabs.push(tab);
    if (background) { render(); save(); } else selectTab(tab.id);
    if (url === HOME && !background) revealAddress(true);
    return tab;
  } catch (error) { toast(error.message); }
}
function selectTab(id) {
  if (!session.tabs.some(tab => tab.id === id)) return;
  dismissRadial(); session.selected = id;
  if (current().url !== CANVAS) previousPage = id;
  $("tab-list").close(); render(); save();
}
function removeTab(id) {
  const tab = closeTab(session, id);
  if (!tab) return;
  pageNodes.get(id)?.node.remove(); pageNodes.delete(id);
  dismissRadial(); render(); save(); renderTabList();
}
function restoreClosed() {
  const tab = session.closed.shift();
  if (!tab) { toast("No closed prototype tabs to restore."); return; }
  session.tabs.push(tab); selectTab(tab.id);
}
function navigate(raw, tab = current()) {
  try {
    navigateTab(tab, raw); dismissRadial(); render(); save(); concealAddress();
  } catch (error) { toast(error.message); }
}
function travel(step) {
  if (travelTab(current(), step)) { render(); save(); }
}
function render() {
  for (const tab of session.tabs) {
    let record = pageNodes.get(tab.id);
    if (!record) {
      record = {node: element("section", "tab-page"), url: null};
      record.node.dataset.tabId = tab.id; pageNodes.set(tab.id, record); $("pages").append(record.node);
    }
    record.node.hidden = tab.id !== session.selected;
    if (record.url !== tab.url) {
      record.url = tab.url; record.node.replaceChildren();
      if (tab.url === HOME) renderWorkspace(record.node);
      else if (tab.url === CANVAS) {
        const iframe = element("iframe", "web-frame canvas-frame"); iframe.title = "Orbit Canvas";
        iframe.src = "/native/canvas.html"; record.node.append(iframe);
      }
      else renderWebsite(tab, record);
    }
  }
  const tab = current();
  $("compact-title").textContent = tab.title;
  if (document.activeElement !== $("address-input")) $("address-input").value = tab.url === HOME ? "" : tab.url;
  $("tab-count").textContent = session.tabs.length;
  $("frame-select").replaceChildren(...["", ...new Set(["Ideas", "Reading", "Work", ...session.tabs.map(tab => tab.frame).filter(Boolean)])].map(frame => {
    const option = element("option", "", frame || "Loose tabs"); option.value = frame; return option;
  }));
  $("frame-select").value = tab.frame;
  document.querySelector('[data-command="back"]').disabled = tab.position === 0;
  document.querySelector('[data-command="forward"]').disabled = tab.position === tab.history.length - 1;
  document.title = `${tab.title} · Orbit Focus lab`;
  updateGestureLayer();
}
function renderWorkspace(parent) {
  const workspace = element("div", "workspace");
  workspace.innerHTML = `<div class="workspace-inner"><header class="workspace-header"><div class="brand"><img src="/native/orbit.svg" alt="">orbit</div><span class="eyebrow">A LITTLE ROOM TO THINK</span></header><span class="eyebrow">YOUR WORKSPACE</span><h1>Follow your<br>curiosity.</h1><p class="workspace-intro">A quieter way to wander. Open a page, gather a few ideas, and let the interface get out of your way.</p><form class="workspace-search"><span>⌖</span><input aria-label="Open a website" placeholder="Where would you like to go?" spellcheck="false"><button aria-label="Open website">↗</button></form><div class="frame-grid"></div><footer class="workspace-footer"><span>Alt+L address · Alt+T new tab · Alt+Q tabs</span><button class="workspace-settings">Tune your space ↗</button></footer></div>`;
  const examples = [
    ["Ideas", [["Example domain", "A real, embeddable website", "https://example.com/", "↗"], ["The web", "Another real page", "https://example.org/", "◉"]]],
    ["Reading", [["Field notes", "Local page for testing gestures", "/fixtures/notes.html", "▤"], ["A longer read", "Scroll, follow links, and switch tabs", "/fixtures/article.html", "▣"]]],
  ];
  for (const [frame, sites] of examples) {
    const group = element("section", "workspace-frame");
    const heading = element("div", "frame-heading"); heading.append(element("h2", "", frame), element("span", "", `${sites.length} starting points`)); group.append(heading);
    for (const [title, desc, raw, icon] of sites) {
      const url = new URL(raw, location.origin).href;
      const card = button("", () => addTab(url, frame), "site-card");
      const label = element("span"); label.append(element("b", "", title), element("small", "", desc));
      card.append(element("span", "site-card-icon", icon), label); group.append(card);
    }
    workspace.querySelector(".frame-grid").append(group);
  }
  workspace.querySelector("form").addEventListener("submit", event => { event.preventDefault(); navigate(workspace.querySelector("input").value); });
  workspace.querySelector(".workspace-settings").addEventListener("click", openSettings);
  const canvasButton = button("Open your canvas ↗", () => command("canvas"), "primary-button");
  workspace.querySelector(".workspace-search").after(canvasButton);
  parent.append(workspace);
}
async function renderWebsite(tab, record) {
  const url = tab.url;
  const unavailable = reason => {
    if (record.url !== url || !session.tabs.includes(tab)) return;
    const page = element("div", "workspace unavailable");
    const inner = element("div", "workspace-inner");
    inner.append(element("span", "eyebrow", "PROTOTYPE LIMIT"), element("h1", "", "This site is unavailable\nin the prototype."), element("p", "workspace-intro", `${titleFor(url)} ${reason}`),
      button("Back to workspace ↗", () => navigate(HOME, tab), "primary-button"));
    page.append(inner); record.node.replaceChildren(page); updateGestureLayer();
  };
  record.unavailable = unavailable;
  let policy;
  if (new URL(url).origin !== location.origin) {
    try {
      const response = await fetch(`/api/frame-policy?url=${encodeURIComponent(url)}`);
      if (response.ok) policy = await response.json();
    } catch { /* The live frame remains usable if preflight is unavailable. */ }
  }
  if (record.url !== url || !session.tabs.includes(tab)) return;
  if (policy?.blocked) { unavailable("does not allow this page to be embedded."); return; }
  const iframe = element("iframe", "web-frame");
  iframe.title = tab.title; iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads");
  iframe.src = url;
  iframe.addEventListener("error", () => unavailable("could not be loaded."));
  record.frameAccessible = false;
  observeFrame(iframe, {
    isCurrent: () => session.tabs.includes(tab) && record.node.contains(iframe),
    onAccess: accessible => {
      record.frameAccessible = accessible; updateGestureLayer();
      if (!accessible && launched && prefs.gestures && current() === tab) toast("Design mode keeps Orbit right-clicks available. Use Browse in the address island, or Alt+G, for website clicks and scrolling.");
    },
    onNavigate: (frameURL, title) => {
      if (frameURL !== tab.url) { navigateTab(tab, frameURL); record.url = tab.url; }
      tab.title = title || titleFor(tab.url); save(); render();
    },
    onDown: (point, event) => { if (prefs.gestures && event.button === 2) startGesture(point.x, point.y, event); },
    onMove: point => { if (gesture) moveGesture(point.x, point.y); },
    onUp: (point, event) => { if (event.button === 2) endGesture(point.x, point.y); },
    onContext: event => { if (prefs.gestures && launched) event.preventDefault(); },
    onKey: keyboard,
    onLink: event => {
      const link = event.target.closest("a");
      if (link && (event.ctrlKey || event.metaKey || event.button === 1)) { event.preventDefault(); addTab(link.href, tab.frame); }
    },
  });
  record.node.append(iframe); updateGestureLayer();
}
function clearTimer(key) { clearTimeout(timers.get(key)); timers.delete(key); }
function later(key, fn, delay) { clearTimer(key); timers.set(key, setTimeout(fn, delay)); }
function revealIsland(id) { clearTimer(`hide-${id}`); $(id).classList.add("visible"); $(id).inert = false; }
function hideIsland(id) { $(id).classList.remove("visible"); $(id).inert = true; }
function revealAddress(expand = false) {
  revealIsland("address-island");
  if (expand) {
    $("address-island").classList.add("expanded"); $("address-form").hidden = false; $("compact-address").hidden = true;
    $("address-input").value = current().url === HOME ? "" : current().url;
    $("address-input").focus(); $("address-input").select(); suggestions();
  }
}
function concealAddress() {
  $("suggestions").hidden = true; $("address-input").blur();
  $("address-island").classList.remove("expanded"); $("address-form").hidden = true; $("compact-address").hidden = false;
  hideIsland("address-island");
}
for (const [sensor, island] of [["address-sensor", "address-island"], ["window-sensor", "window-island"]]) {
  $(sensor).addEventListener("pointerenter", () => { if (launched) later(`reveal-${island}`, () => revealIsland(island), prefs.dwell); });
  $(sensor).addEventListener("pointerleave", () => {
    clearTimer(`reveal-${island}`);
    later(`hide-${island}`, () => {
      if ($(island).matches(":hover") || $(island).contains(document.activeElement)) return;
      if (island === "address-island") concealAddress(); else hideIsland(island);
    }, 450);
  });
  $(island).addEventListener("pointerenter", () => clearTimer(`hide-${island}`));
  const schedule = () => later(`hide-${island}`, () => {
    if ($(island).contains(document.activeElement)) return;
    if (island === "address-island") concealAddress(); else hideIsland(island);
  }, 450);
  $(island).addEventListener("pointerleave", schedule); $(island).addEventListener("focusout", schedule);
}
$("compact-address").addEventListener("click", () => revealAddress(true));
$("address-form").addEventListener("submit", event => { event.preventDefault(); navigate($("address-input").value); });
$("address-input").addEventListener("input", suggestions);
$("address-input").addEventListener("keydown", event => {
  if (event.key === "ArrowDown") { event.preventDefault(); $("suggestions").querySelector("button")?.focus(); }
});
function suggestions() {
  const query = $("address-input").value.toLowerCase();
  $("suggestions").replaceChildren();
  const items = session.tabs.filter(tab => tab.url !== HOME && `${tab.title} ${tab.url}`.toLowerCase().includes(query)).slice(0, 5);
  for (const tab of items) {
    const item = button(tab.title, () => { selectTab(tab.id); concealAddress(); });
    item.append(element("small", "", tab.frame || "Open tab")); $("suggestions").append(item);
  }
  $("suggestions").hidden = !items.length;
}

function dismissRadial() { view.hide("dismiss"); mode = null; gesture = null; }
function showRadial(kind, {x = innerWidth / 2, y = innerHeight / 2, held = false} = {}) {
  if (!launched) return;
  concealAddress(); hideIsland("window-island"); mode = kind;
  const items = kind === "tools" ? toolsItems() : kind === "tabs" ? tabTree(session.tabs, session.selected) : kind === "canvas" ? canvasItems() : pageItems();
  view.show({mode: kind === "tools" ? "focus-tools" : kind === "tabs" ? "tabs" : "context", corner: kind === "tools", center: {x, y},
    items, focus: !held && kind !== "tools", passthrough: held,
    centerItem: {id: kind === "tools" ? "home" : kind === "canvas" ? "canvas-dismiss" : "new-tab", label: kind === "tools" ? "Orbit workspace" : kind === "canvas" ? "Canvas actions" : "New tab", icon: kind === "tools" ? "⌖" : kind === "canvas" ? "✧" : "＋"},
    onActivate: (node, event) => activate(node, event),
    onDismiss: () => { mode = null; gesture = null; },
  });
  if (kind === "tools") view.root.addEventListener("pointerleave", event => {
    if (Math.hypot(event.clientX, event.clientY) > view.geometry.radius + 28) {
      later("tools-hide", () => { if (mode === "tools") dismissRadial(); }, 450);
    }
  });
}
function activate(node, event) {
  if (node.id?.startsWith("canvas-action-")) { const run = canvasAction?.run; dismissRadial(); run?.(node.id.slice(14)); return; }
  if (node.kind === "tab") { selectTab(node.id); return; }
  if (node.kind === "tab-close") { if (event?.isTrusted || gesture?.released) removeTab(node.tabId); return; }
  const id = node.id; dismissRadial(); command(id);
}
const action = (id, label, icon, children) => ({id, label, icon, ...(children ? {children} : {})});
function toolsItems() {
  return [action("new-tab", "New tab", "＋"), action("tab-list", "All tabs", "▦"), action("canvas", "Canvas", "▣"), action("fullscreen", "Fullscreen", "↗"),
    action("tab-menu", "Tabs", "◉", [action("tabs", "Switch tabs", "▦"), action("restore-tab", "Reopen tab", "↻")]),
    action("bookmarks", "Bookmarks", "☆", [action("example", "Example", "◉"), action("example-org", "Example.org", "◉"), action("bookmark", "Save page", "☆")]),
    action("appearance", "Appearance", "✧", [...DESIGNS.map(design => action(`design-${design.id}`, design.name, "✧")), action("theme-dark", "Dark", "◉"), action("theme-light", "Light", "◉"), action("theme-system", "System", "◉")]),
    action("settings-menu", "Settings", "⌖", [action("settings", "Tune focus", "⌖"), action("gestures", prefs.gestures ? "Browse page" : "Gesture layer", "◉"), action("page-unavailable", "Page unavailable", "◉"), action("exit", "Leave focus", "↗")])];
}
function pageItems() {
  return [action("back", "Back", "←"), action("forward", "Forward", "→"), action("reload", "Reload", "↻"), action("bookmark", "Bookmark", "☆"),
    action("duplicate", "Duplicate tab", "＋"), action("home", "Workspace", "▣"), action("close-current", "Close tab", "↗"),
    action("page-more", "More", "•••", [action("tab-list", "All tabs", "▦"), action("settings", "Settings", "⌖"), action("gestures", "Browse page", "◉"), action("page-unavailable", "Page unavailable", "◉")])]
    .map(item => ({...item, disabled: item.id === "back" && current().position === 0 || item.id === "forward" && current().position === current().history.length - 1}));
}
function canvasItems() {
  return [["note", "Note", "▧"], ["tab", "Tab", "＋"], ["frame", "Frame", "▣"], ["connect", "Connect", "⤳"], ["peek", "Peek", "◉"], ["delete", "Remove", "×"]].map(([id, label, icon]) => ({
    ...action(`canvas-action-${id}`, label, icon), disabled: id === "peek" ? !canvasAction?.peek : id === "delete" ? !canvasAction?.remove : false,
  }));
}
$("tab-button").addEventListener("click", () => showRadial("tabs"));
$("tabs-sensor").addEventListener("pointerenter", () => { if (launched) later("tabs-reveal", () => showRadial("tabs", {x: innerWidth - 160, y: innerHeight / 2}), prefs.dwell); });
$("tabs-sensor").addEventListener("pointerleave", () => clearTimer("tabs-reveal"));
$("tabs-sensor").addEventListener("click", () => showRadial("tabs"));
$("tools-sensor").addEventListener("pointerenter", () => { if (launched) later("tools-reveal", () => showRadial("tools", {x: 0, y: 0}), prefs.dwell); });
$("tools-sensor").addEventListener("pointerleave", () => clearTimer("tools-reveal"));
$("tools-sensor").addEventListener("click", () => showRadial("tools", {x: 0, y: 0}));
document.addEventListener("pointermove", event => {
  if (gesture) moveGesture(event.clientX, event.clientY);
  if (mode === "tools" && view.geometry) {
    const radius = view.geometry.radius;
    if (Math.hypot(event.clientX, event.clientY) <= radius + 28) clearTimer("tools-hide");
    else later("tools-hide", () => { if (mode === "tools") dismissRadial(); }, 450);
  }
});
function startGesture(x, y, event) {
  if (!launched || !event.isTrusted) return;
  screenOrigin = {x: event.screenX - x, y: event.screenY - y};
  event.preventDefault(); showRadial("tabs", {x, y, held: true});
  gesture = {x, y, moved: false};
}
function moveGesture(x, y) {
  gesture.moved ||= Math.hypot(x - gesture.x, y - gesture.y) > 10;
  view.updatePointer({x, y});
}
function endGesture(x, y) {
  if (!gesture) return;
  const hit = view.hitTest({x, y}); const moved = gesture.moved; const origin = {x: gesture.x, y: gesture.y};
  gesture.released = true;
  if (moved && hit?.children?.length) { view.setPassthrough(false); view.activateAt({x, y}); gesture = null; return; }
  if (moved && hit) { activate(hit, null); gesture = null; return; }
  gesture = null; showRadial("context", origin);
}
document.addEventListener("pointerdown", event => {
  if (!event.target.closest("#address-island, #address-sensor")) concealAddress();
  if (event.button === 2 && !event.target.closest(".island, dialog, .orbit-radial-root, .welcome")) startGesture(event.clientX, event.clientY, event);
});
document.addEventListener("pointerup", event => { if (event.button === 2 && event.isTrusted) endGesture(event.clientX, event.clientY); });
document.addEventListener("contextmenu", event => { if (launched && !event.target.closest("input,textarea")) event.preventDefault(); });
window.addEventListener("blur", () => { dismissRadial(); concealAddress(); hideIsland("window-island"); });

function openSettings() {
  dismissRadial(); concealAddress(); $("frame-select").value = current().frame; $("settings").showModal();
}
function renderTabList() {
  $("tab-list-items").replaceChildren();
  for (const tab of session.tabs) {
    const row = element("div", `tab-row${tab.id === session.selected ? " selected" : ""}`);
    const pick = button("", () => selectTab(tab.id), "tab-select");
    pick.append(element("b", "", tab.title), element("small", "", tab.frame || (tab.url === HOME ? "Workspace" : tab.url)));
    const close = button("×", () => removeTab(tab.id)); close.setAttribute("aria-label", `Close ${tab.title}`);
    row.append(pick, close); $("tab-list-items").append(row);
  }
}
async function fullscreen() {
  if (document.fullscreenElement) { await document.exitFullscreen(); return true; }
  try {
    if (!document.fullscreenEnabled) throw new Error("Fullscreen is unavailable in this preview. Open the local URL in a browser window to use it.");
    await document.documentElement.requestFullscreen({navigationUI: "hide"}); return true;
  } catch (error) { toast(error.message || "Fullscreen was declined. You can still explore in this window."); return false; }
}
function enter() { launched = true; $("welcome").hidden = true; render(); }
$("start-fullscreen").addEventListener("click", async () => { if (await fullscreen()) enter(); });
$("start-windowed").addEventListener("click", enter);
function leave() {
  dismissRadial(); concealAddress(); hideIsland("window-island"); launched = false; $("welcome").hidden = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
function command(id) {
  if (id.startsWith("design-")) { setDesign(id.slice(7), true); return; }
  switch (id) {
    case "new-tab": $("tab-list").close(); addTab(); break;
    case "home": navigate(HOME); break;
    case "canvas": {
      if (current().url !== CANVAS) previousPage = current().id;
      const tab = session.tabs.find(item => item.url === CANVAS);
      if (tab) selectTab(tab.id); else addTab(CANVAS);
      break;
    }
    case "canvas-dismiss": break;
    case "preview-menu": $("settings").close(); showRadial("context"); break;
    case "back": travel(-1); break;
    case "forward": travel(1); break;
    case "reload": pageNodes.get(current().id).url = null; render(); break;
    case "duplicate": addTab(current().url, current().frame); break;
    case "close-current": removeTab(current().id); break;
    case "tabs": showRadial("tabs"); break;
    case "tab-list": renderTabList(); $("tab-list").showModal(); break;
    case "close-tab-list": $("tab-list").close(); break;
    case "restore-tab": restoreClosed(); break;
    case "settings": openSettings(); break;
    case "close-settings": $("settings").close(); break;
    case "fullscreen": fullscreen(); break;
    case "pause": leave(); break;
    case "exit": leave(); break;
    case "example": addTab("https://example.com/", "Ideas"); break;
    case "example-org": addTab("https://example.org/", "Ideas"); break;
    case "page-unavailable": if (current().url !== HOME) pageNodes.get(current().id)?.unavailable?.("may block frames or require its full browser environment."); break;
    case "bookmark": current().frame = "Reading"; save(); toast("Added this prototype tab to Reading."); break;
    case "gestures": prefs.gestures = !prefs.gestures; $("gesture-toggle").checked = prefs.gestures; updateGestureLayer(); savePrefs(); toast(prefs.gestures ? "Design mode. Orbit right-clicks stay available across pages." : "Browse mode. Website clicks and scrolling are enabled; Alt+G returns to Design mode."); break;
    case "theme-dark": case "theme-light": case "theme-system": prefs.theme = id.slice(6); setTheme(); savePrefs(); break;
  }
}
document.addEventListener("click", event => { const target = event.target.closest("[data-command]"); if (target) command(target.dataset.command); });
$("theme").addEventListener("change", () => { prefs.theme = $("theme").value; setTheme(); savePrefs(); });
$("dwell").addEventListener("change", () => { prefs.dwell = Number($("dwell").value); savePrefs(); });
$("gesture-toggle").addEventListener("change", () => command("gestures"));
$("frame-select").addEventListener("change", () => { current().frame = $("frame-select").value; save(); });
$("reset-session").addEventListener("click", () => {
  for (const record of pageNodes.values()) record.node.remove(); pageNodes.clear();
  const first = newTab(); session = {tabs: [first], selected: first.id, closed: []}; render(); save(); $("settings").close();
});
function keyboard(event) {
  if (event.defaultPrevented || !launched || event.isComposing || event.repeat) return;
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const key = event.key.toLowerCase();
    if (["d", "r"].includes(key) && !event.shiftKey) return;
    if (["l", "t", "q", "s", "d", "g", "r", "c"].includes(key)) {
      event.preventDefault(); if (key !== "r") dismissRadial();
      if (key === "l") revealAddress(true);
      if (key === "t") addTab();
      if (key === "q") showRadial("tabs");
      if (key === "s") openSettings();
      if (key === "d") setDesign(DESIGNS[(DESIGNS.findIndex(design => design.id === prefs.design) + 1) % DESIGNS.length].id, true);
      if (key === "g") command("gestures");
      if (key === "r") setMenuStyle(MENU_STYLES[(MENU_STYLES.findIndex(style => style.id === prefs.menuStyle) + 1) % MENU_STYLES.length].id, true);
      if (key === "c") command("canvas");
    }
  }
  if (event.key === "Escape" && !$("settings").open && !$("tab-list").open) {
    if (mode) dismissRadial(); else concealAddress();
  }
}
document.addEventListener("keydown", keyboard);
canvasHost = createCanvasHost({
  read: safeRead, write: safeWrite, tabs: () => session.tabs, select: selectTab,
  open(record) {
    const existing = session.tabs.find(tab => tab.id === record.tabId && tab.url === record.url);
    if (existing) return existing;
    const tab = addTab(record.url, record.frame || "", {background: true});
    if (!tab) throw new Error("Close a few prototype tabs before adding more.");
    return tab;
  },
  returnToPage() {
    if (current().url !== CANVAS) return;
    const tab = session.tabs.find(tab => tab.id === previousPage && tab.url !== CANVAS) || session.tabs.find(tab => tab.url !== CANVAS);
    if (tab) selectTab(tab.id); else addTab();
  },
  menu(child, event, options) {
    if (current().url !== CANVAS) return;
    const bounds = child.frameElement.getBoundingClientRect(); canvasAction = options;
    showRadial("canvas", {x: bounds.x + event.clientX, y: bounds.y + event.clientY});
  },
  dismiss: dismissRadial, keyboard,
  onBoard(board, previous) {
    const oldNames = new Set(previous?.frames.map(frame => frame.title) || []);
    for (const item of board.items.filter(item => item.type === "tab")) {
      const tab = session.tabs.find(tab => tab.id === item.tabId);
      const frame = board.frames.find(frame => frame.id === item.frameId);
      if (tab && frame) tab.frame = frame.title.slice(0, 120);
      else if (tab && oldNames.has(tab.frame)) tab.frame = "";
    }
    safeWrite(STORAGE_KEY, JSON.stringify({tabs: session.tabs, selected: session.selected}));
  },
});
window.OrbitPrototype = canvasHost;
render();
const updates = new EventSource("/events");
updates.addEventListener("change", () => { save(); location.reload(); });
