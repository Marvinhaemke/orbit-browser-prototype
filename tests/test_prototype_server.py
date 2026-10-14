import importlib.util
import pathlib
import unittest
import subprocess
import json
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / "scripts/prototype_server.py"
spec = importlib.util.spec_from_file_location("prototype_server", path)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class Headers:
    def __init__(self, policy): self.policy = policy
    def get_all(self, name, fallback): return [self.policy] if self.policy else fallback


class Response:
    status = 200
    def __init__(self, policy="", xframe=""): self.headers, self.xframe = Headers(policy), xframe
    def getheader(self, name, fallback=""): return self.xframe if name == "X-Frame-Options" else fallback


class Connection:
    def __init__(self, response): self.response = response
    def request(self, *args, **kwargs): pass
    def getresponse(self): return self.response
    def close(self): pass


class PrototypeServerTests(unittest.TestCase):
    def test_canvas_adapters_execute_without_firefox_privileges_and_share_board_validation(self):
        script = server.canvas_asset("/native/canvas.js", server.NATIVE["/native/canvas.js"].read_text(encoding="utf-8"))
        self.assertNotIn("ChromeUtils", script)
        self.assertIn("parent.OrbitPrototype.openCanvasMenu", script)
        subprocess.run(["node", "--input-type=module", "--check"], input=script, text=True, encoding="utf-8", check=True, capture_output=True)
        model = server.canvas_asset("/native/board-model.mjs", server.NATIVE["/native/board-model.mjs"].read_text(encoding="utf-8"))
        assertions = """
const {validateBoard} = await import('data:text/javascript,' + encodeURIComponent(MODEL));
const base = {version:1,camera:{x:0,y:0,zoom:1},frames:[],items:[],connections:[],strokes:[]};
assert.deepEqual(validateBoard(base), base);
const tab = {id:'tab-a',type:'tab',x:0,y:0,w:248,h:160,url:'https://example.com/',title:'Example',tabId:'live-a'};
assert.equal(validateBoard({...base, items:[tab]}).items[0].url, tab.url);
for (const url of ['javascript:alert(1)', 'file:///private', 'https://user:pass@example.com/']) {
  assert.throws(() => validateBoard({...base,items:[{...tab,url}]}));
}
assert.throws(() => validateBoard({...base, items:[tab,tab]}));
assert.throws(() => validateBoard({...base, connections:[{id:'link',from:'absent',to:'other'}]}));
assert.throws(() => validateBoard({...base,camera:{x:0,y:0,zoom:Infinity}}));
"""
        subprocess.run(["node", "--input-type=module"], input="import assert from 'node:assert/strict';\nconst MODEL=" + json.dumps(model) + ";\n" + assertions, text=True, encoding="utf-8", check=True, capture_output=True)
        html = server.canvas_asset("/native/canvas.html", server.NATIVE["/native/canvas.html"].read_text(encoding="utf-8"))
        self.assertIn('type="module" src="/native/canvas.js"', html)
        self.assertIn("object-src 'none'", html)
        self.assertNotIn("chrome:", html)

    def check_policy(self, policy="", xframe=""):
        response = Response(policy, xframe)
        with patch.object(server, "public_target", return_value=(server.urlsplit("https://example.com/"), "93.184.215.14", 443)), patch.object(server, "PinnedConnection", return_value=Connection(response)):
            return server.frame_policy("https://example.com/", "http://127.0.0.1:8766")

    def test_sites_can_reject_embedding_and_open_sites_remain_allowed(self):
        for policy in ["frame-ancestors 'none'", "frame-ancestors 'self'", "frame-ancestors https://elsewhere.example"]:
            self.assertTrue(self.check_policy(policy)["blocked"])
        self.assertTrue(self.check_policy(xframe="DENY")["blocked"])
        self.assertTrue(self.check_policy(xframe="SAMEORIGIN")["blocked"])
        self.assertFalse(self.check_policy()["blocked"])
        self.assertFalse(self.check_policy("frame-ancestors *", "DENY")["blocked"])
        self.assertFalse(self.check_policy("frame-ancestors http://127.0.0.1:8766")["blocked"])

    def test_server_preflight_never_fetches_private_addresses_or_privileged_schemes(self):
        for url in ["file:///C:/private", "https://user:pass@example.com", "http://localhost:8766", "https://example.com:8443"]:
            with self.assertRaises(ValueError): server.public_target(url)
        private = [(2, 1, 6, "", ("127.0.0.1", 80))]
        with patch.object(server.socket, "getaddrinfo", return_value=private), self.assertRaises(ValueError):
            server.public_target("http://looks-public.example/")


if __name__ == "__main__": unittest.main()
