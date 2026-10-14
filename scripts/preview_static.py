#!/usr/bin/env python3
"""Preview built static assets plus the actual Vercel endpoint locally."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("frame_policy_api", ROOT / "api/frame-policy.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class PreviewHandler(SimpleHTTPRequestHandler, api.handler):
    default_scheme = "http"

    def do_GET(self):
        if urlsplit(self.path).path == "/api/frame-policy":
            api.handler.do_GET(self)
        else:
            super().do_GET()

    def do_POST(self):
        api.handler.do_POST(self)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    if not (ROOT / "dist/index.html").is_file():
        raise SystemExit("Run npm run build first.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(PreviewHandler, directory=str(ROOT / "dist")))
    print(f"Built prototype preview: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
