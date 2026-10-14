import {validateBoard} from "/native/board-model.mjs";
import {HOME, CANVAS, STORAGE_KEY} from "./model.mjs";

export function createCanvasHost({read, write, tabs, open, select, returnToPage, menu, keyboard, dismiss, onBoard}) {
  const key = `${STORAGE_KEY}.canvas`;
  const listeners = new Map();
  const clone = value => value == null ? null : structuredClone(value);
  let board = null;
  try { const saved = JSON.parse(read(key)); if (saved) board = validateBoard(saved); } catch { /* Invalid stored boards remain isolated. */ }
  let selectedID = null;
  const liveTabs = () => tabs().filter(tab => ![HOME, CANVAS].includes(tab.url)).map(tab => ({...tab, active: tab.id === selectedID, userContextId: 0}));
  function notify(change) {
    for (const [child, callback] of listeners) {
      if (!child.frameElement?.isConnected) { listeners.delete(child); continue; }
      callback(liveTabs(), change);
    }
  }
  function sync(child) {
    if (!child.frameElement?.isConnected) return;
    const source = getComputedStyle(document.documentElement), root = child.document.documentElement;
    root.dataset.theme = document.documentElement.dataset.theme;
    root.dataset.design = document.documentElement.dataset.design;
    for (const name of ["bg", "surface", "raised", "ink", "muted", "accent", "line", "shadow"]) root.style.setProperty(`--lab-${name}`, source.getPropertyValue(`--${name}`));
  }
  function closePeek() { document.querySelector(".canvas-peek")?.remove(); }
  async function peek(record) {
    const panel = document.createElement("section"); panel.className = "canvas-peek"; panel.setAttribute("aria-label", "Canvas website preview");
    const header = document.createElement("header"), title = document.createElement("span"), close = document.createElement("button");
    title.textContent = new URL(record.url).hostname; close.textContent = "×"; close.setAttribute("aria-label", "Close canvas preview");
    close.addEventListener("click", () => panel.remove()); header.append(title, close); panel.append(header);
    closePeek(); document.body.append(panel);
    let policy;
    try { policy = await (await fetch(`/api/frame-policy?url=${encodeURIComponent(record.url)}`)).json(); } catch { /* The browser still enforces embedding policy. */ }
    if (!panel.isConnected) return;
    if (policy?.blocked) { const message = document.createElement("p"); message.textContent = "This site is unavailable in the prototype."; message.style.padding = "24px"; panel.append(message); return; }
    const iframe = document.createElement("iframe"); iframe.title = `Preview ${title.textContent}`;
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals"); iframe.src = record.url; panel.append(iframe);
  }
  return {
    keyboard, dismissMenu: dismiss,
    notifyTabs(id) { selectedID = id; notify({type: "tabs-changed"}); },
    syncAppearance() { for (const child of listeners.keys()) sync(child); },
    openCanvasMenu: menu,
    connectCanvas(child) {
      if (child.parent !== window || child.location.origin !== location.origin) throw new Error("Canvas must belong to this prototype.");
      sync(child);
      return {
        getBoard: async () => clone(board),
        saveBoard(value) {
          const previous = board; board = validateBoard(value); write(key, JSON.stringify(board));
          onBoard(board, previous);
          for (const [other, callback] of listeners) if (other !== child && other.frameElement?.isConnected) callback(liveTabs(), {type: "board-changed", board: clone(board)});
        },
        listTabs: async () => clone(liveTabs()),
        openTab: async record => clone(open(record)),
        selectTab: async id => { closePeek(); select(id); },
        hideCanvas() { closePeek(); returnToPage(); },
        async openFrame(id) {
          const frame = board?.frames.find(item => item.id === id);
          if (!frame) return;
          for (const item of board.items.filter(item => item.type === "tab" && item.frameId === id)) item.tabId = open({...item, frame: frame.title, background: true}).id;
          write(key, JSON.stringify(board));
          for (const [other, callback] of listeners) if (other !== child && other.frameElement?.isConnected) callback(liveTabs(), {type: "board-changed", board: clone(board)});
        },
        peek, split: peek, closePeek,
        subscribe(callback) { listeners.set(child, callback); sync(child); return () => listeners.delete(child); },
      };
    },
  };
}
