export function observeFrame(iframe, callbacks) {
  const documents = new WeakSet();
  const point = event => {
    const bounds = iframe.getBoundingClientRect();
    return {x: bounds.x + event.clientX, y: bounds.y + event.clientY};
  };
  iframe.addEventListener("load", () => {
    if (!callbacks.isCurrent()) return;
    let doc, href;
    try {
      doc = iframe.contentDocument;
      href = iframe.contentWindow.location.href;
    } catch {
      callbacks.onAccess(false);
      return;
    }
    if (!doc || href === "about:blank") { callbacks.onAccess(false); return; }
    callbacks.onAccess(true);
    callbacks.onNavigate(href, doc.title);
    if (!callbacks.isCurrent() || documents.has(doc)) return;
    documents.add(doc);
    for (const [type, name] of [["pointerdown", "onDown"], ["pointermove", "onMove"], ["pointerup", "onUp"]]) {
      doc.addEventListener(type, event => {
        if (event.isTrusted && callbacks.isCurrent()) callbacks[name](point(event), event);
      }, true);
    }
    doc.addEventListener("contextmenu", event => {
      if (callbacks.isCurrent()) callbacks.onContext(event);
    }, true);
    doc.addEventListener("keydown", event => {
      if (callbacks.isCurrent()) callbacks.onKey(event);
    }, true);
    doc.addEventListener("click", event => {
      if (event.isTrusted && callbacks.isCurrent()) callbacks.onLink(event);
    }, true);
  });
}
