import assert from "node:assert/strict";
import test from "node:test";
import {OrbitRadialView, pageRadialItems, layoutRadialRings, radialSectorPath, hitRadialGeometry,
  layoutTabCloseTarget, hitRadialCloseTarget}
  from "../vendor/orbit/OrbitRadialView.sys.mjs";

test("pagination keeps every original action reachable through bounded rings", () => {
  const source = Array.from({length: 133}, (_, index) => ({id: `native-${index}`, label: `Tab ${index}`}));
  const visited = [];
  let page = source;
  let depth = 0;
  while (page.length) {
    const visible = pageRadialItems(page, depth++);
    assert.ok(visible.length <= 8);
    visited.push(...visible.filter(item => !item.orbitSynthetic));
    page = visible.find(item => item.orbitSynthetic)?.children || [];
  }
  assert.deepEqual(visited, source);
});

test("all ring sectors hit their corresponding original index including angular wrap", () => {
  for (let count = 1; count <= 8; count++) {
    const geometry = layoutRadialRings({width: 1440, height: 960, center: {x: 600, y: 440}, counts: [count, 8, 3]});
    for (const ring of geometry.rings) {
      const radius = (ring.inner + ring.outer) / 2;
      for (let index = 0; index < ring.count; index++) {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / ring.count;
        const hit = hitRadialGeometry(geometry, geometry.center.x + Math.cos(angle) * radius,
          geometry.center.y + Math.sin(angle) * radius);
        assert.deepEqual(hit, {depth: ring.depth, index});
      }
    }
    assert.deepEqual(hitRadialGeometry(geometry, geometry.center.x, geometry.center.y), {center: true});
  }
});

test("submenu fans open around the selected parent, including angles crossing zero", () => {
  for (let parentIndex = 0; parentIndex < 8; parentIndex++) {
    for (let count = 1; count <= 8; count++) {
      const geometry = layoutRadialRings({width: 1440, height: 960, center: {x: 600, y: 440},
        counts: [8, count], parentIndices: [parentIndex]});
      const [root, fan] = geometry.rings;
      assert.equal(root.fan, false);
      assert.equal(fan.fan, true);
      assert.equal(fan.anchor, root.sectors[parentIndex].angle);
      assert.ok(fan.span <= Math.PI * 8 / 9);
      assert.ok(fan.span < Math.PI * 2);
      assert.ok(Math.abs(fan.start + fan.span / 2 - fan.anchor) < 1e-12);
      const radius = (fan.inner + fan.outer) / 2;
      for (const sector of fan.sectors) {
        assert.ok(Math.abs(sector.angle - fan.anchor) < Math.PI / 2);
        assert.deepEqual(hitRadialGeometry(geometry,
          geometry.center.x + Math.cos(sector.angle) * radius,
          geometry.center.y + Math.sin(sector.angle) * radius), {depth: 1, index: sector.index});
      }
    }
  }
});

test("unused fan arcs stay inactive while separators select their neighboring slice", () => {
  const geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 640, y: 400},
    counts: [8, 8, 3], parentIndices: [7, 0]});
  for (const ring of geometry.rings) {
    const radius = (ring.inner + ring.outer) / 2;
    const hitAt = angle => hitRadialGeometry(geometry,
      geometry.center.x + Math.cos(angle) * radius,
      geometry.center.y + Math.sin(angle) * radius);
    assert.equal(hitAt(ring.start)?.depth, ring.depth);
    for (let index = 1; index < ring.count; index++) {
      assert.equal(hitAt((ring.sectors[index - 1].end + ring.sectors[index].start) / 2)?.depth, ring.depth);
    }
    if (ring.fan) {
      assert.equal(hitAt(ring.anchor + Math.PI), null);
      assert.equal(hitAt(ring.start - .1), null);
      assert.equal(hitAt(ring.end + .1), null);
    }
  }
});

test("each deeper fan inherits its actual parent midpoint rather than the root orientation", () => {
  const parents = [6, 0, 7, 2];
  const geometry = layoutRadialRings({width: 1600, height: 1000, center: {x: 800, y: 500},
    counts: [8, 8, 8, 8, 4], parentIndices: parents});
  for (let depth = 1; depth < geometry.rings.length; depth++) {
    const ring = geometry.rings[depth];
    const parent = geometry.rings[depth - 1].sectors[parents[depth - 1]];
    assert.equal(ring.anchor, parent.angle);
    assert.notEqual(ring.anchor, -Math.PI / 2);
    const radius = (ring.inner + ring.outer) / 2;
    for (const sector of ring.sectors) {
      assert.deepEqual(hitRadialGeometry(geometry,
        geometry.center.x + Math.cos(sector.angle) * radius,
        geometry.center.y + Math.sin(sector.angle) * radius), {depth, index: sector.index});
    }
  }
});

test("recursive More pages retain their opening points and every final leaf remains hittable", () => {
  const source = Array.from({length: 133}, (_, index) => ({id: `tab-${index}`}));
  const pages = [];
  const parents = [];
  let nodes = source;
  while (nodes.length) {
    const page = pageRadialItems(nodes, pages.length);
    pages.push(page);
    const moreIndex = page.findIndex(node => node.orbitSynthetic);
    if (moreIndex < 0) break;
    parents.push(moreIndex);
    nodes = page[moreIndex].children;
  }
  const geometry = layoutRadialRings({width: 1440, height: 960, center: {x: 720, y: 480},
    counts: pages.map(page => page.length), parentIndices: parents});
  for (const ring of geometry.rings) {
    const radius = (ring.inner + ring.outer) / 2;
    for (const sector of ring.sectors) {
      const hit = hitRadialGeometry(geometry,
        geometry.center.x + Math.cos(sector.angle) * radius,
        geometry.center.y + Math.sin(sector.angle) * radius);
      assert.deepEqual(hit, {depth: ring.depth, index: sector.index});
      assert.equal(pages[hit.depth][hit.index], pages[ring.depth][sector.index]);
    }
    if (ring.depth) assert.equal(ring.anchor, geometry.rings[ring.depth - 1].sectors[parents[ring.depth - 1]].angle);
  }
});

test("separator gaps preserve submenu hysteresis by yielding no target", () => {
  const geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 640, y: 400}, counts: [8, 5]});
  const between = (geometry.rings[0].outer + geometry.rings[1].inner) / 2;
  assert.equal(hitRadialGeometry(geometry, geometry.center.x + between, geometry.center.y), null);
  assert.equal(hitRadialGeometry(geometry, -100, -100), null);
});

test("canvas-style option circles preserve useful desktop targets without overlapping", () => {
  for (const [width, height] of [[1280, 800], [1440, 960]]) {
    for (let depth = 1; depth <= 4; depth++) {
      const geometry = layoutRadialRings({width, height, center: {x: width / 2, y: height / 2},
        counts: Array(depth).fill(8), parentIndices: Array(depth - 1).fill(7)});
      const sectors = geometry.rings.flatMap(ring => ring.sectors);
      for (const sector of sectors) {
        assert.ok(sector.targetRadius * 2 >= 44, `${depth} rings at ${width}x${height}`);
        assert.ok(sector.targetRadius * 2 <= 66);
        assert.ok(Math.hypot(sector.x - geometry.center.x, sector.y - geometry.center.y) >
          geometry.centerRadius + sector.targetRadius);
        for (const other of sectors) {
          if (sector === other) continue;
          assert.ok(Math.hypot(sector.x - other.x, sector.y - other.y) >
            sector.targetRadius + other.targetRadius, "distinct commands must have a gap");
        }
      }
    }
  }
});

test("the entire slice selects its command beyond the circular highlight", () => {
  const geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 640, y: 400},
    counts: [8, 8], parentIndices: [0]});
  const sector = geometry.rings[0].sectors[0];
  const corner = sector.targetRadius * .9;
  assert.deepEqual(hitRadialGeometry(geometry, sector.x + corner, sector.y - corner), {depth: 0, index: 0});
  const ring = geometry.rings[0];
  assert.deepEqual(hitRadialGeometry(geometry, geometry.center.x,
    geometry.center.y - (ring.inner + 2)), {depth: 0, index: 0});
});

test("selection covers each slice across its radial and angular extent", () => {
  const geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 640, y: 400}, counts: [8]});
  const ring = geometry.rings[0];
  for (const sector of ring.sectors) {
    for (const radius of [ring.inner + .01, ring.orbitRadius, ring.outer - .01]) {
      for (const angle of [sector.start - ring.insetAngle + .001, sector.angle,
        sector.end + ring.insetAngle - .001]) {
        assert.deepEqual(hitRadialGeometry(geometry,
          geometry.center.x + Math.cos(angle) * radius, geometry.center.y + Math.sin(angle) * radius),
        {depth: 0, index: sector.index});
      }
    }
    assert.equal(hitRadialGeometry(geometry,
      geometry.center.x + Math.cos(sector.angle) * (ring.outer + 1),
      geometry.center.y + Math.sin(sector.angle) * (ring.outer + 1)), null);
  }
});

test("corner pie slices distinguish the two arcs even along the same direction", () => {
  const geometry = layoutRadialRings({width: 1280, height: 800, counts: [8, 3],
    parentIndices: [5], corner: true});
  for (const sector of geometry.rings[0].sectors) {
    for (const radius of [sector.inner + .01, sector.outer - .01]) {
      for (const angle of [sector.start, sector.angle, sector.end]) {
        assert.deepEqual(hitRadialGeometry(geometry, Math.cos(angle) * radius,
          Math.sin(angle) * radius), {depth: 0, index: sector.index});
      }
    }
  }
});

test("edge placement and arbitrary depth remain inside the viewport", () => {
  for (const [width, height] of [[1440,960],[800,600],[320,240],[160,120]]) {
    for (const depth of [1,3,4,8,20,60]) {
      for (const center of [{x: 0,y: 0}, {x: width,y: height}]) {
        const geometry = layoutRadialRings({width,height,center,counts:Array(depth).fill(8),
          parentIndices:Array(Math.max(0, depth - 1)).fill(7)});
        assert.ok(geometry.center.x - geometry.radius >= 0);
        assert.ok(geometry.center.y - geometry.radius >= 0);
        assert.ok(geometry.center.x + geometry.radius <= width);
        assert.ok(geometry.center.y + geometry.radius <= height);
        assert.ok(geometry.rings.every(ring => ring.outer > ring.inner));
      }
    }
  }
});

test("deep menus retain readable outer rings by compressing older history", () => {
  const geometry = layoutRadialRings({width:1280,height:800,center:{x:640,y:400},counts:Array(20).fill(8)});
  assert.ok(geometry.rings.at(-1).outer - geometry.rings.at(-1).inner > 50);
  assert.ok(geometry.rings[0].outer - geometry.rings[0].inner < 10);
});

test("single-sector SVG uses two arcs for each circle and never emits NaN", () => {
  const path = radialSectorPath(100,100,30,80,0,Math.PI * 2);
  assert.equal((path.match(/ A /g) || []).length, 4);
  assert.ok(!path.includes("NaN"));
});

test("corner tools retain all eight commands within a compact first quadrant", () => {
  for (const [width, height] of [[1280, 800], [1440, 960], [320, 240]]) {
    const geometry = layoutRadialRings({width, height, center: {x: 220, y: 220}, counts: [8], corner: true});
    assert.deepEqual(geometry.center, {x: 0, y: 0});
    assert.equal(geometry.corner, true);
    assert.ok(geometry.radius <= 288);
    const root = geometry.rings[0];
    assert.equal(root.span, Math.PI / 2);
    assert.equal(root.start, 0);
    assert.equal(root.end, Math.PI / 2);
    assert.equal(root.sectors.length, 8);
    assert.equal(new Set(root.sectors.map(sector => sector.orbitRadius)).size, 2);
    for (const sector of root.sectors) {
      assert.ok(sector.x - sector.targetRadius >= 0 && sector.y - sector.targetRadius >= 0);
      assert.ok(sector.x + sector.targetRadius <= width && sector.y + sector.targetRadius <= height);
      if (height >= 800) assert.ok(sector.targetRadius * 2 >= 64, "root labels keep useful desktop targets");
      assert.deepEqual(hitRadialGeometry(geometry, sector.x, sector.y), {depth: 0, index: sector.index});
      assert.ok(Math.hypot(sector.x, sector.y) > geometry.centerRadius + sector.targetRadius);
      for (const other of root.sectors) if (sector !== other) {
        assert.ok(Math.hypot(sector.x - other.x, sector.y - other.y) > sector.targetRadius + other.targetRadius);
      }
    }
    assert.deepEqual(hitRadialGeometry(geometry, 30, 30), {center: true});
    assert.equal(hitRadialGeometry(geometry, -1, 30), null);
    assert.equal(hitRadialGeometry(geometry, 30, -1), null);
    assert.equal(hitRadialGeometry(geometry, geometry.centerRadius + 1, 0), null);
  }
});

test("corner submenu fans stay local to the original parent and fully onscreen", () => {
  for (let parentIndex = 0; parentIndex < 8; parentIndex++) {
    for (let childCount = 1; childCount <= 8; childCount++) {
      const geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 0, y: 0},
        counts: [8, childCount, 4], parentIndices: [parentIndex, childCount - 1], corner: true});
      for (const ring of geometry.rings.slice(1)) {
        assert.equal(ring.fan, true);
        assert.ok(ring.span <= Math.PI / 2);
        const parent = geometry.rings[ring.depth - 1].sectors[ring.depth === 1 ? parentIndex : childCount - 1];
        assert.equal(ring.anchor, parent.angle);
        for (const sector of ring.sectors) {
          assert.ok(Math.abs(sector.angle - parent.angle) < Math.PI / 2);
          assert.ok(sector.x - sector.targetRadius >= 0 && sector.y - sector.targetRadius >= 0);
          assert.ok(sector.x + sector.targetRadius <= 1280 && sector.y + sector.targetRadius <= 800);
          assert.deepEqual(hitRadialGeometry(geometry, sector.x, sector.y), {depth: ring.depth, index: sector.index});
        }
      }
      const targets = geometry.rings.flatMap(ring => ring.sectors);
      for (const target of targets) for (const other of targets) if (target !== other) {
        assert.ok(Math.hypot(target.x - other.x, target.y - other.y) > target.targetRadius + other.targetRadius);
      }
    }
  }
});

test("slow transit across another corner group preserves its open fan until stationary dwell", () => {
  let now = 0, serial = 0;
  const timers = new Map();
  const win = {document: {}, setTimeout(callback, delay) {
    const id = ++serial; timers.set(id, {callback, at: now + delay}); return id;
  }, clearTimeout(id) { timers.delete(id); }};
  const items = Array.from({length: 8}, (_, index) => ({id: `tool-${index}`,
    children: index >= 4 ? [{id: `child-${index}`}] : undefined}));
  const view = new OrbitRadialView(win);
  view.model = {items}; view.rings = [items, items[4].children]; view.path = [items[4]];
  view.geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 0, y: 0},
    counts: [8, 1], parentIndices: [4], corner: true});
  view._paintActive = () => {}; view._render = () => {};
  const other = view.geometry.rings[0].sectors[5];
  for (let step = 0; step < 8; step++) {
    now += 40;
    view.updatePointer({x: other.x + step, y: other.y});
    for (const [id, timer] of timers) if (timer.at <= now) {
      timers.delete(id); timer.callback();
    }
    assert.equal(view.path[0].id, items[4].id);
  }
  now += 100;
  for (const [id, timer] of timers) if (timer.at <= now) {
    timers.delete(id); timer.callback();
  }
  assert.equal(view.path[0].id, items[5].id, "a deliberate hover still selects the adjacent group");
});

test("tab close targets fit inside their parent circles and leave tab centers selectable", () => {
  for (const [width, height] of [[1280, 800], [800, 600], [320, 240]]) {
    for (const depth of [1, 2, 4, 20]) {
      const geometry = layoutRadialRings({width, height, center: {x: 10, y: 10},
        counts: Array(depth).fill(8), parentIndices: Array(depth - 1).fill(3)});
      const sectors = geometry.rings.flatMap(ring => ring.sectors);
      const targets = sectors.map(sector => ({...layoutTabCloseTarget(sector), parent: sector}));
      for (const target of targets) {
        const parent = target.parent;
        assert.ok(Math.hypot(target.x - parent.x, target.y - parent.y) + target.radius < parent.targetRadius);
        assert.equal(hitRadialCloseTarget(targets, target.x, target.y), target);
        assert.equal(hitRadialCloseTarget(targets, parent.x, parent.y), null);
        for (const other of sectors) if (other !== parent) {
          assert.ok(Math.hypot(target.x - other.x, target.y - other.y) > target.radius + other.targetRadius);
        }
      }
    }
  }
});

function tabView({passthrough = false} = {}) {
  const win = {document: {}, clearTimeout() {}, setTimeout() { return 1; }};
  const view = new OrbitRadialView(win);
  const items = Array.from({length: 8}, (_, index) => ({kind: "tab", id: `tab-${index}`, label: `Tab ${index}`,
    closeAction: {kind: "tab-close", id: `tab-${index}:close`, tabId: `tab-${index}`, label: `Close Tab ${index}`}}));
  const activations = [];
  view.model = {items, passthrough, onActivate(node, event) { activations.push({node, event}); }};
  view.rings = [items];
  view.root = {classList: {contains() { return false; }}};
  view.geometry = layoutRadialRings({width: 1280, height: 800, center: {x: 640, y: 400}, counts: [8]});
  view.closeTargets = view.geometry.rings[0].sectors.map((sector, index) => ({
    ...layoutTabCloseTarget(sector), node: items[index].closeAction, parent: items[index],
    depth: 0, index, close: true,
  }));
  view._paintActive = () => {};
  return {view, items, activations};
}

test("right-hold release hit testing distinguishes the X from the surrounding tab", () => {
  const {view, items} = tabView({passthrough: true});
  for (const [index, target] of view.closeTargets.entries()) {
    const sector = view.geometry.rings[0].sectors[index];
    assert.equal(view.hitTest({x: sector.x, y: sector.y}), items[index]);
    assert.equal(view.hitTest(target), items[index].closeAction);
    assert.equal(view.updatePointer(target), items[index].closeAction);
    assert.equal(view.active.parent, items[index]);
    assert.equal(view.active.close, true);
    // One pixel beyond the X retains the ordinary switch action.
    assert.equal(view.hitTest({x: target.x - target.radius - 1, y: target.y}), items[index]);
  }
});

test("Delete closes only an explicitly selected tab under trusted unmodified non-held input", () => {
  const {view, items, activations} = tabView();
  const key = overrides => ({key: "Delete", isTrusted: true, preventDefault() { this.prevented = true; },
    stopPropagation() {}, ...overrides});
  view.active = {node: items[2], depth: 0, index: 2};
  for (const overrides of [{isTrusted: false}, {repeat: true}, {ctrlKey: true}, {metaKey: true},
    {altKey: true}, {shiftKey: true}, {defaultPrevented: true}]) view._keyboard(key(overrides));
  assert.equal(activations.length, 0);
  view.model.passthrough = true;
  const held = key(); view._keyboard(held);
  assert.equal(held.prevented, undefined);
  view.model.passthrough = false;
  view.active = {node: {kind: "tab-group", children: [items[0]], closeAction: items[0].closeAction}, depth: 0, index: 0};
  view._keyboard(key());
  assert.equal(activations.length, 0);
  view.active = {node: items[2], depth: 0, index: 2};
  const event = key(); view._keyboard(event);
  assert.equal(event.prevented, true);
  assert.equal(activations[0].node, items[2].closeAction);
  view.active = {...view.closeTargets[4]};
  view._keyboard(key());
  assert.equal(activations[1].node, items[4].closeAction);
});

test("close activation does not accept missing or synthetic events", () => {
  const {view, items, activations} = tabView();
  view._activate(items[0].closeAction);
  view._activate(items[0].closeAction, {isTrusted: false});
  view.model.passthrough = true;
  view._activate(items[0].closeAction, {isTrusted: true});
  assert.equal(activations.length, 0);
  view.model.passthrough = false;
  view._activate(items[0].closeAction, {isTrusted: true, key: "Enter"});
  assert.equal(activations[0].node, items[0].closeAction);
});
