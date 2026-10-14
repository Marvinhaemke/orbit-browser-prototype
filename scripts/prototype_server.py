#!/usr/bin/env python3
"""Serve the buildless focus prototype, shared native assets and live reload."""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import ipaddress
import json
import mimetypes
import os
import re
from pathlib import Path
import socket
import ssl
import threading
import time
from urllib.parse import parse_qs, urljoin, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
PROTOTYPE = ROOT / "prototype/focus"
NATIVE = {
    "/native/radial-view.mjs": ROOT / "vendor/orbit/OrbitRadialView.sys.mjs",
    "/native/orbit-radial.css": ROOT / "vendor/orbit/orbit-radial.css",
    "/native/orbit.svg": ROOT / "vendor/orbit/orbit.svg",
    "/native/canvas.html": ROOT / "vendor/orbit/orbit.html",
    "/native/canvas.js": ROOT / "vendor/orbit/orbit.js",
    "/native/orbit.css": ROOT / "vendor/orbit/orbit.css",
    "/native/board-model.mjs": ROOT / "vendor/orbit/Orbit.sys.mjs",
}


def canvas_asset(path, source):
    """Adapt packaged canvas assets for the local website; never edit the fork."""
    if path == "/native/canvas.html":
        source = re.sub(r'  <meta http-equiv="Content-Security-Policy"[^\n]+\n', "", source)
        source = source.replace('href="orbit.svg"', 'href="/native/orbit.svg"')
        source = source.replace('href="orbit.css"', 'href="/native/orbit.css"')
        source = source.replace("</head>", '  <link rel="stylesheet" href="/canvas-skin.css">\n</head>')
        source = source.replace('<script src="orbit.js"></script>', '<script type="module" src="/native/canvas.js"></script>')
        # External pages render only in the parent simulator's sandboxed frames.
        source = source.replace("</head>", '  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\'; object-src \'none\'; base-uri \'none\'">\n</head>')
        return source
    if path == "/native/canvas.js":
        source = source.replace('  const {hitRadialGeometry} = ChromeUtils.importESModule("moz-src:///browser/components/orbit/OrbitRadialView.sys.mjs");', "")
        start, end = source.index("  let bridge;"), source.index("  // The native new-tab document")
        source = source[:start] + "  const bridge = parent.OrbitPrototype.connectCanvas(window);\n" + source[end:]
        start, end = source.index("    const radial = $(\"radial\");", source.index("  function showRadial(event)")), source.index("\n  function pointerDown(event)")
        source = source[:start] + """    parent.OrbitPrototype.openCanvasMenu(window, event, {
      peek: board.items.some(item => item.id === selected && item.type === "tab"),
      remove: !!selected,
      run: action => {
        if (action === "note") addNote(radialPoint);
        if (action === "tab") showAdd(radialPoint);
        if (action === "frame") { checkpoint(); addFrame(radialPoint); }
        if (action === "connect") {
          const item = board.items.find(i => i.id === selected);
          setTool("connect"); if (item) connectTo(item);
        }
        if (action === "peek") {
          const item = board.items.find(i => i.id === selected && i.type === "tab");
          if (item) tabAction(item, "peek");
        }
        if (action === "delete") removeSelection();
      }
    });
  }
""" + source[end:]
        source = source.replace('viewport.addEventListener("pointerdown", pointerDown);', 'viewport.addEventListener("pointerdown", event => { parent.OrbitPrototype.dismissMenu(); pointerDown(event); });')
        source = source.replace('  document.addEventListener("keydown", keyboard);', '  document.addEventListener("keydown", event => { parent.OrbitPrototype.keyboard(event); if (!event.defaultPrevented) keyboard(event); });')
        return 'import {hitRadialGeometry} from "/native/radial-view.mjs";\n' + source
    if path == "/native/board-model.mjs":
        constants = source[source.index("const MAX_BYTES"):source.index("function identifier")]
        functions = source[source.index("function identifier"):source.index("\nfunction clone")]
        start, end = functions.index("function webURL("), functions.index("\nfunction isWebURL")
        functions = functions[:start] + """function webURL(value) {
  text(value, 8192, "URL");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new TypeError("Orbit cards require an HTTP or HTTPS URL without credentials");
  }
  return url.href;
}
""" + functions[end:]
        return source[:source.index("/**")] + constants + functions + "\nexport {validateBoard};\n"
    return source


def public_target(raw: str):
    url = urlsplit(raw)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
        raise ValueError("Only public HTTP and HTTPS website addresses are supported.")
    port = url.port or (443 if url.scheme == "https" else 80)
    if port not in {80, 443}:
        raise ValueError("Only standard website ports can be checked.")
    addresses = socket.getaddrinfo(url.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(value[4][0]).is_global for value in addresses):
        raise ValueError("Private network addresses are not checked by this server.")
    return url, addresses[0][4][0], port


class PinnedConnection(http.client.HTTPConnection):
    def __init__(self, hostname, address, port, secure):
        super().__init__(hostname, port, timeout=3)
        self.address, self.secure = address, secure

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)
        if self.secure:
            self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=self.host)


def frame_policy(raw: str, prototype_origin: str) -> dict:
    """Advisory header check; the browser still enforces the actual frame policy."""
    for _ in range(5):
        url, address, port = public_target(raw)
        connection = PinnedConnection(url.hostname, address, port, url.scheme == "https")
        try:
            connection.request("HEAD", url.path + (f"?{url.query}" if url.query else "") or "/",
                               headers={"Host": url.netloc, "User-Agent": "OrbitFocusPrototype/1.0", "Connection": "close"})
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308} and response.getheader("Location"):
                raw = urljoin(raw, response.getheader("Location"))
                continue
            policies = response.headers.get_all("Content-Security-Policy", [])
            target_origin = f"{url.scheme}://{url.netloc}"
            has_ancestors = False
            for policy in policies:
                for directive in policy.split(";"):
                    parts = directive.split()
                    if not parts or parts[0].lower() != "frame-ancestors":
                        continue
                    has_ancestors = True
                    sources = parts[1:]
                    # Restrictive self/none and explicit origins are decisive.
                    if not sources or sources == ["'none'"] or sources == ["'self'"] and target_origin != prototype_origin:
                        return {"blocked": True, "reason": "frame-ancestors"}
                    simple = all(source in {"'self'", "'none'", "*"} or "://" in source and "*" not in source for source in sources)
                    if simple and "*" not in sources and prototype_origin not in sources and not ("'self'" in sources and target_origin == prototype_origin):
                        return {"blocked": True, "reason": "frame-ancestors"}
            xframe = response.getheader("X-Frame-Options", "").upper()
            if not has_ancestors and ("DENY" in xframe or "SAMEORIGIN" in xframe and target_origin != prototype_origin):
                return {"blocked": True, "reason": "X-Frame-Options"}
            return {"blocked": False, "reason": "browser-enforced"}
        finally:
            connection.close()
    return {"blocked": False, "reason": "redirect-limit"}


def snapshot():
    files = [*PROTOTYPE.rglob("*"), *NATIVE.values()]
    return tuple(sorted((str(file), file.stat().st_mtime_ns, file.stat().st_size)
                        for file in files if file.is_file()))


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        path = urlsplit(self.path).path
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.send_error(403, "Use the local prototype directly.")
            return
        if self.headers.get("Host") not in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}:
            self.send_error(403, "Local prototype only.")
            return
        if path == "/health":
            self.reply(json.dumps({"service": "orbit-focus-lab", "root": str(ROOT), "pid": os.getpid()}).encode(), "application/json")
            return
        if path == "/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            state = snapshot()
            try:
                while not self.server.stopping.wait(.6):
                    changed = snapshot()
                    if state != changed:
                        time.sleep(.2)
                        state = snapshot()
                        self.wfile.write(b"event: change\ndata: reload\n\n")
                    else:
                        self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return
        if path == "/api/frame-policy":
            raw = parse_qs(urlsplit(self.path).query).get("url", [""])[0]
            try:
                if len(raw) > 4096:
                    raise ValueError("Address is too long.")
                result = frame_policy(raw, f"http://{self.headers['Host']}")
            except (ValueError, OSError, http.client.HTTPException):
                result = {"blocked": False, "reason": "unverified"}
            data = json.dumps(result).encode()
            self.reply(data, "application/json")
            return
        file = NATIVE.get(path)
        if file is None:
            file = (PROTOTYPE / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
            if not file.is_relative_to(PROTOTYPE.resolve()):
                self.send_error(403)
                return
        if not file.is_file():
            self.send_error(404)
            return
        mime = "text/javascript" if file.suffix == ".mjs" else mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        if path in {"/native/canvas.html", "/native/canvas.js", "/native/board-model.mjs"}:
            data = canvas_asset(path, file.read_text(encoding="utf-8")).encode()
            mime = "text/html" if path.endswith(".html") else "text/javascript"
        else:
            data = file.read_bytes()
        self.reply(data, mime)

    def reply(self, data, mime):
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        token = os.environ.get("ORBIT_PROTOTYPE_TOKEN")
        if (self.path != "/shutdown" or not token or self.headers.get("X-Orbit-Token") != token
                or self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}"):
            self.send_error(403)
            return
        self.reply(b'{"stopped":true}', "application/json")
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith("GET /events"):
            return
        super().log_message(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as error:
        raise SystemExit(f"Prototype port is unavailable: {error}. Try --port 8767.")
    server.stopping = threading.Event()
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"Orbit Focus lab: {url}\nEdits reload automatically. Ctrl+C stops this server.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.stopping.set()
        server.server_close()


if __name__ == "__main__":
    main()
