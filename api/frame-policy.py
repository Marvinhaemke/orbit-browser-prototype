"""Vercel endpoint for advisory embedding checks; never proxies page content."""
from http.server import BaseHTTPRequestHandler
import http.client
import json
import re
from urllib.parse import parse_qs, urlsplit

from scripts.prototype_server import frame_policy


class handler(BaseHTTPRequestHandler):
    def reply(self, result, status=200):
        data = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.reply({"blocked": False, "reason": "same-origin-only"}, 403)
            return
        values = parse_qs(urlsplit(self.path).query).get("url", [])
        host = self.headers.get("Host", "")
        scheme = self.headers.get("X-Forwarded-Proto", getattr(self, "default_scheme", "https"))
        if len(values) != 1 or len(values[0]) > 4096 or not re.fullmatch(r"[a-zA-Z0-9.-]+(?::[0-9]{1,5})?", host) or scheme not in {"http", "https"}:
            self.reply({"blocked": False, "reason": "invalid-request"}, 400)
            return
        raw = values[0]
        try:
            if scheme == "https" and urlsplit(raw).scheme == "http":
                result = {"blocked": True, "reason": "mixed-content"}
            else:
                result = frame_policy(raw, f"{scheme}://{host}")
        except ValueError:
            self.reply({"blocked": False, "reason": "invalid-address"}, 400)
            return
        except (OSError, http.client.HTTPException):
            result = {"blocked": False, "reason": "unverified"}
        self.reply(result)

    def do_POST(self):
        self.reply({"blocked": False, "reason": "method-not-allowed"}, 405)
