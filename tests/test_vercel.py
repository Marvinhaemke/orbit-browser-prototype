import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("vercel_frame_api", ROOT / "api/frame-policy.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class Request:
    default_scheme = "https"
    reply = api.handler.reply

    def __init__(self, path="/api/frame-policy?url=https%3A%2F%2Fexample.com%2F", headers=None):
        self.path = path
        self.headers = {"Host": "orbit-preview.vercel.app", **(headers or {})}
        self.wfile = io.BytesIO()
        self.response_headers = {}

    def send_response(self, status): self.status = status
    def send_header(self, key, value): self.response_headers[key] = value
    def end_headers(self): pass
    def json(self): return json.loads(self.wfile.getvalue())


class VercelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, "scripts/build_static.py"], cwd=ROOT, check=True, capture_output=True)

    def test_static_output_contains_all_runtime_assets_without_local_server_endpoints(self):
        output = ROOT / "dist"
        for route in ["index.html", "app.mjs", "embedding-policy.mjs", "canvas-host.mjs", "menus.css", "fixtures/notes.html", "native/canvas.html", "native/canvas.js", "native/board-model.mjs", "native/radial-view.mjs"]:
            self.assertTrue((output / route).is_file(), route)
        self.assertIn('data-live-reload="false"', (output / "index.html").read_text(encoding="utf-8"))
        self.assertIn('type="module" src="/native/canvas.js"', (output / "native/canvas.html").read_text(encoding="utf-8"))
        self.assertNotIn("ChromeUtils", (output / "native/canvas.js").read_text(encoding="utf-8"))
        for path in output.rglob("*"):
            self.assertNotEqual(path.suffix, ".py")
            self.assertNotIn(path.name, {"server-8766.json", "health", "events", "shutdown"})
        subprocess.run(["node", "--check", str(output / "native/canvas.js")], check=True, capture_output=True)
        subprocess.run(["node", "--check", str(output / "app.mjs")], check=True, capture_output=True)

    def test_api_returns_the_existing_policy_shape_for_the_actual_deployment_origin(self):
        request = Request()
        with patch.object(api, "frame_policy", return_value={"blocked": True, "reason": "frame-ancestors"}) as check:
            api.handler.do_GET(request)
        check.assert_called_once_with("https://example.com/", "https://orbit-preview.vercel.app")
        self.assertEqual(request.status, 200)
        self.assertTrue(request.json()["blocked"])
        self.assertEqual(request.response_headers["Cache-Control"], "no-store")

    def test_api_does_not_fetch_malformed_cross_site_or_mixed_content_requests(self):
        for request, status in [(Request("/api/frame-policy"), 400), (Request(headers={"Host": "bad/host"}), 400), (Request(headers={"Sec-Fetch-Site": "cross-site"}), 403), (Request("/api/frame-policy?url=http%3A%2F%2Fexample.com%2F"), 200)]:
            with patch.object(api, "frame_policy") as check:
                api.handler.do_GET(request)
                check.assert_not_called()
            self.assertEqual(request.status, status)
        self.assertEqual(request.json(), {"blocked": True, "reason": "mixed-content"})

    def test_api_private_addresses_and_network_failures_never_return_site_content(self):
        for error, status, reason in [(ValueError("private address"), 400, "invalid-address"), (OSError("offline"), 200, "unverified")]:
            request = Request()
            with patch.object(api, "frame_policy", side_effect=error):
                api.handler.do_GET(request)
            self.assertEqual(request.status, status)
            self.assertEqual(request.json(), {"blocked": False, "reason": reason})
        request = Request()
        api.handler.do_POST(request)
        self.assertEqual(request.status, 405)

    def test_vercel_configuration_builds_dist_and_bundles_the_shared_checker(self):
        config = json.loads((ROOT / "vercel.json").read_text())
        self.assertEqual(config["outputDirectory"], "dist")
        self.assertEqual(config["buildCommand"], "npm run build")
        self.assertEqual(config["functions"]["api/frame-policy.py"]["includeFiles"], "scripts/prototype_server.py")


if __name__ == "__main__":
    unittest.main()
