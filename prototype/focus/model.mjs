export const HOME = "orbit:workspace";
export const CANVAS = "orbit:canvas";
export const STORAGE_KEY = "orbit.focus-lab.v1";

export function normalizeAddress(raw) {
  const value = String(raw).trim();
  if (!value || value === HOME) return HOME;
  if (value === CANVAS) return CANVAS;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:/i.test(value) && !/^[\w.-]+:\d+(?:\/|$)/.test(value)) throw new Error("Enter an HTTP or HTTPS website address.");
  const url = new URL(/^https?:/i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Enter a website address without embedded credentials.");
  return url.href;
}

export function titleFor(url) {
  return url === HOME ? "Orbit workspace" : url === CANVAS ? "Orbit Canvas" : new URL(url).hostname.replace(/^www\./, "");
}

export function newTab(url = HOME, frame = "") {
  const address = normalizeAddress(url);
  return {id: crypto.randomUUID(), url: address, title: titleFor(address), frame,
    history: [address], position: 0};
}

export function navigateTab(tab, raw) {
  const url = normalizeAddress(raw);
  if (url === tab.url) return false;
  tab.history = [...tab.history.slice(0, tab.position + 1), url].slice(-60);
  tab.position = tab.history.length - 1;
  tab.url = url; tab.title = titleFor(url);
  return true;
}

export function travelTab(tab, step) {
  const position = Math.max(0, Math.min(tab.history.length - 1, tab.position + step));
  if (position === tab.position) return false;
  tab.position = position; tab.url = tab.history[position]; tab.title = titleFor(tab.url);
  return true;
}

export function closeTab(session, id) {
  const index = session.tabs.findIndex(tab => tab.id === id);
  if (index < 0) return null;
  const [closed] = session.tabs.splice(index, 1);
  session.closed = [closed, ...(session.closed || [])].slice(0, 10);
  if (!session.tabs.length) session.tabs.push(newTab());
  if (session.selected === id) session.selected = session.tabs[Math.min(index, session.tabs.length - 1)].id;
  return closed;
}

export function restoreSession(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tabs)) return null;
    const ids = new Set();
    const tabs = data.tabs.slice(0, 60).flatMap(saved => {
      try {
        if (typeof saved.url !== "string" || typeof saved.id !== "string" || !/^[a-z\d-]{1,64}$/i.test(saved.id) || ids.has(saved.id)) return [];
        const tab = newTab(saved.url, typeof saved.frame === "string" && saved.frame.length <= 120 ? saved.frame : "");
        tab.id = saved.id; ids.add(tab.id);
        return [tab];
      } catch { return []; }
    });
    if (!tabs.length) return null;
    return {tabs, selected: tabs.some(tab => tab.id === data.selected) ? data.selected : tabs[0].id, closed: []};
  } catch { return null; }
}

export function tabTree(tabs, selected) {
  const leaf = tab => ({id: tab.id, label: tab.title, icon: tab.id === selected ? "✓" : "◉", kind: "tab",
    checked: tab.id === selected, closeAction: {id: `${tab.id}:close`, tabId: tab.id, kind: "tab-close", label: `Close ${tab.title}`}});
  const bySite = (members, prefix) => {
    const buckets = new Map();
    for (const tab of members) {
      const host = [HOME, CANVAS].includes(tab.url) ? "" : new URL(tab.url).hostname;
      if (!buckets.has(host)) buckets.set(host, []);
      buckets.get(host).push(tab);
    }
    return [...buckets].flatMap(([host, items]) => host && items.length > 1 ? [{id: `${prefix}:site:${host}`, label: host.replace(/^www\./, ""), icon: "◉", children: items.map(leaf)}] : items.map(leaf));
  };
  const frames = new Map();
  for (const tab of tabs) {
    if (!frames.has(tab.frame)) frames.set(tab.frame, []);
    frames.get(tab.frame).push(tab);
  }
  return [...frames].flatMap(([frame, members]) => frame ? [{id: `frame:${frame}`, label: frame, icon: "▣", children: bySite(members, frame)}] : bySite(members, "loose"));
}
