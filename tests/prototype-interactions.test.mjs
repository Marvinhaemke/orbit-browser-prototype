import assert from "node:assert/strict";
import {test} from "node:test";
import {DESIGNS, MENU_STYLES, prototypePreferences, needsGestureLayer} from "../prototype/focus/preferences.mjs";
import {observeFrame} from "../prototype/focus/frame-events.mjs";

class Target {
  listeners = new Map();
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  emit(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback(event); }
}
function fixture() {
  const iframe = new Target();
  iframe.getBoundingClientRect = () => ({x: 20, y: 30});
  const events = [], accesses = [], navigations = [];
  let current = true;
  observeFrame(iframe, {
    isCurrent: () => current,
    onAccess: value => accesses.push(value),
    onNavigate: (url, title) => navigations.push({url, title}),
    onDown: (point, event) => events.push({type: "down", point, event}),
    onMove: point => events.push({type: "move", point}),
    onUp: point => events.push({type: "up", point}),
    onContext: event => event.preventDefault(), onKey() {}, onLink() {},
  });
  const load = (url, title) => {
    const doc = new Target(); doc.title = title;
    iframe.contentDocument = doc; iframe.contentWindow = {location: {href: url}};
    iframe.emit("load"); return doc;
  };
  return {iframe, events, accesses, navigations, load, stale() { current = false; }};
}
test("each newly loaded local document regains Orbit gestures and context suppression", () => {
  const f = fixture();
  for (const [url, title] of [["http://localhost/one", "One"], ["http://localhost/two", "Two"]]) {
    const doc = f.load(url, title);
    const event = {isTrusted: true, button: 2, clientX: 70, clientY: 80, preventDefault() { this.prevented = true; }};
    doc.emit("pointerdown", event); doc.emit("pointerup", event); doc.emit("contextmenu", event);
    assert.equal(event.prevented, true);
    assert.deepEqual(f.events.at(-1).point, {x: 90, y: 110});
  }
  assert.deepEqual(f.accesses, [true, true]);
  assert.deepEqual(f.navigations.map(item => item.title), ["One", "Two"]);
  assert.deepEqual(f.events.map(event => event.type), ["down", "up", "down", "up"]);
});
test("cross-origin navigation activates the design layer and returning reconnects the next document", () => {
  const f = fixture(); f.load("http://localhost/one", "One");
  f.iframe.contentDocument = null;
  f.iframe.contentWindow = {get location() { throw new Error("SecurityError"); }};
  f.iframe.emit("load");
  assert.equal(f.accesses.at(-1), false);
  assert.equal(needsGestureLayer({designMode: true, hasFrame: true, frameAccessible: false}), true);
  const returned = f.load("http://localhost/two", "Two");
  returned.emit("pointerdown", {isTrusted: true, clientX: 1, clientY: 2});
  assert.equal(f.events.length, 1); assert.deepEqual(f.accesses, [true, false, true]);
});
test("repeated load notification does not duplicate handlers and retired frames cannot affect tabs", () => {
  const f = fixture(); const doc = f.load("http://localhost/one", "One");
  f.iframe.emit("load");
  doc.emit("pointerdown", {isTrusted: true, clientX: 0, clientY: 0});
  assert.equal(f.events.length, 1);
  doc.emit("pointerdown", {isTrusted: false, clientX: 0, clientY: 0});
  assert.equal(f.events.length, 1);
  f.stale(); doc.emit("pointerup", {isTrusted: true, clientX: 0, clientY: 0});
  f.iframe.emit("load"); assert.equal(f.events.length, 1);
});
test("all four designs and the chosen interaction mode survive preference restoration", () => {
  assert.deepEqual(DESIGNS.map(design => design.id), ["liquid", "glass", "paper", "studio"]);
  for (const {id} of DESIGNS) for (const gestures of [true, false]) {
    const saved = {design: id, menuStyle: "pie", gestures, theme: "light", dwell: 250};
    assert.deepEqual(prototypePreferences(JSON.parse(JSON.stringify(saved))), saved);
  }
  assert.equal(prototypePreferences({theme: "dark"}).gestures, true);
  assert.equal(prototypePreferences(null).design, "liquid");
  assert.deepEqual(prototypePreferences({design: "unknown", gestures: "false", theme: "bad", dwell: 1}), {design: "liquid", menuStyle: "pie", gestures: true, theme: "dark", dwell: 140});
});

test("menu approaches persist independently of the page design", () => {
  assert.deepEqual(MENU_STYLES.map(style => style.id), ["soft", "pie", "halo", "petals", "type"]);
  for (const {id} of MENU_STYLES) for (const {id: design} of DESIGNS) {
    const saved = prototypePreferences({design, menuStyle: id});
    assert.equal(saved.design, design); assert.equal(saved.menuStyle, id);
  }
  assert.equal(prototypePreferences({menuStyle: "unknown"}).menuStyle, "pie");
});
test("the gesture layer never covers the workspace or an accessible local document", () => {
  assert.equal(needsGestureLayer({designMode: true, hasFrame: false, frameAccessible: false}), false);
  assert.equal(needsGestureLayer({designMode: true, hasFrame: true, frameAccessible: true}), false);
  assert.equal(needsGestureLayer({designMode: false, hasFrame: true, frameAccessible: false}), false);
});
