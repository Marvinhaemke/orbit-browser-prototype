import assert from "node:assert/strict";
import {test} from "node:test";
import {HOME, CANVAS, normalizeAddress, newTab, navigateTab, travelTab, closeTab, restoreSession, tabTree} from "../prototype/focus/model.mjs";

test("website inputs accept HTTP addresses and local ports and reject privileged schemes and credentials", () => {
  assert.equal(normalizeAddress("example.com/path"), "https://example.com/path");
  assert.equal(normalizeAddress("localhost:8766/fixtures/notes.html"), "https://localhost:8766/fixtures/notes.html");
  assert.equal(normalizeAddress("http://127.0.0.1:8766/fixtures/notes.html"), "http://127.0.0.1:8766/fixtures/notes.html");
  assert.equal(normalizeAddress(HOME), HOME);
  for (const raw of ["javascript:alert(1)", "data:text/html,<script>", "file:///C:/private", "chrome://browser/content/", "https://name:password@example.com", "not an address"])
    assert.throws(() => normalizeAddress(raw), raw);
});

test("the canvas restores as an internal tab with its custom frame grouping intact", () => {
  const canvas = newTab(CANVAS), page = newTab("https://example.com/", "Design lab");
  const restored = restoreSession(JSON.stringify({tabs: [canvas, page], selected: canvas.id}));
  assert.equal(restored.tabs[0].url, CANVAS); assert.equal(restored.tabs[0].title, "Orbit Canvas");
  assert.equal(restored.tabs[1].frame, "Design lab");
  const tree = tabTree(restored.tabs, canvas.id);
  assert.equal(tree[0].id, canvas.id); assert.equal(tree[1].label, "Design lab");
  assert.throws(() => normalizeAddress("orbit:private"));
});
test("navigation keeps independent history and a new branch drops only forward entries", () => {
  const a = newTab("https://example.com/"); const b = newTab("https://example.org/");
  navigateTab(a, "https://example.com/one"); navigateTab(a, "https://example.com/two");
  assert.equal(travelTab(a, -1), true); assert.equal(a.url, "https://example.com/one");
  navigateTab(a, "https://example.com/branch"); assert.equal(travelTab(a, 1), false);
  assert.deepEqual(a.history, ["https://example.com/", "https://example.com/one", "https://example.com/branch"]);
  assert.deepEqual(b.history, ["https://example.org/"]);
});
test("closing a background tab preserves selection and closing the last tab leaves a workspace", () => {
  const a = newTab(); const b = newTab("https://example.com/");
  const state = {tabs: [a, b], selected: a.id, closed: []};
  assert.equal(closeTab(state, b.id), b); assert.equal(state.selected, a.id);
  assert.equal(closeTab(state, "foreign"), null);
  closeTab(state, a.id);
  assert.equal(state.tabs.length, 1); assert.equal(state.tabs[0].url, HOME);
  assert.equal(state.selected, state.tabs[0].id); assert.deepEqual(state.closed, [a, b]);
});
test("restoration rejects malformed, duplicate and unsafe tabs without touching another storage namespace", () => {
  const tab = newTab("https://example.com/", "Reading");
  const result = restoreSession(JSON.stringify({selected: "missing", tabs: [tab, {...tab}, {...newTab(), url: "javascript:alert(1)"}, {id: "no-url"}]}));
  assert.equal(result.tabs.length, 1); assert.equal(result.selected, tab.id);
  assert.equal(result.tabs[0].frame, "Reading"); assert.equal(restoreSession("corrupt"), null);
});
test("frames contain repeated hostname groups while loose tabs remain independently accessible", () => {
  const a = newTab("https://example.com/a", "Ideas"); const b = newTab("https://example.com/b", "Ideas");
  const c = newTab("https://example.com/c"); const d = newTab(HOME);
  const tree = tabTree([a, b, c, d], b.id);
  assert.equal(tree[0].label, "Ideas"); assert.equal(tree[0].children[0].children.length, 2);
  assert.deepEqual(tree.slice(1).map(node => node.id), [c.id, d.id]);
  const selected = tree[0].children[0].children[1]; assert.equal(selected.checked, true);
  assert.equal(selected.closeAction.tabId, b.id); assert.equal(selected.closeAction.id, `${b.id}:close`);
  assert.deepEqual([a.frame, b.frame, c.frame], ["Ideas", "Ideas", ""]);
});
