#!/usr/bin/env python3
"""Start, inspect or stop Orbit's persistent local focus prototype."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def health(url):
    try:
        with urlopen(url + "health", timeout=1) as response:
            state = json.load(response)
        if state.get("service") != "orbit-focus-lab" or Path(state.get("root", "")).resolve() != ROOT:
            raise RuntimeError("That port belongs to another application.")
        return state
    except (URLError, TimeoutError, ConnectionError, json.JSONDecodeError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", choices=["start", "status", "stop"], default="start")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}/"
    directory = ROOT / "artifacts/local-prototype"
    state_path = directory / f"server-{args.port}.json"
    state = json.loads(state_path.read_text()) if state_path.is_file() else {}
    existing = health(url)
    if args.command == "status":
        print(f"{'Running' if existing else 'Stopped'}: {url}")
        return
    if args.command == "stop":
        if not existing:
            print("The prototype server is already stopped.")
            return
        if not state.get("token") or state.get("pid") != existing.get("pid"):
            raise RuntimeError("This is a foreground server. Stop it with Ctrl+C in its own terminal.")
        request = Request(url + "shutdown", data=b"", headers={"X-Orbit-Token": state["token"]}, method="POST")
        with urlopen(request, timeout=3) as response:
            response.read()
        for _ in range(15):
            if not health(url):
                state_path.unlink(missing_ok=True)
                print("Prototype server stopped.")
                return
            time.sleep(.2)
        raise RuntimeError("The server has not finished stopping.")
    if not existing:
        directory.mkdir(parents=True, exist_ok=True)
        token = secrets.token_urlsafe(32)
        environment = os.environ.copy()
        environment["ORBIT_PROTOTYPE_TOKEN"] = token
        log_path = directory / f"server-{args.port}.log"
        with log_path.open("ab") as log:
            process = subprocess.Popen([sys.executable, "-u", str(ROOT / "scripts/prototype_server.py"), "--port", str(args.port)],
                                       cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                       env=environment, close_fds=True,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            existing = health(url)
            if existing:
                state_path.write_text(json.dumps({"pid": existing["pid"], "port": args.port, "token": token}))
                break
            if process.poll() is not None:
                raise RuntimeError(f"The server could not start. Inspect {log_path}.")
            time.sleep(.15)
        if not existing:
            process.terminate()
            raise RuntimeError(f"The server did not become ready. Inspect {log_path}.")
    print(f"Orbit Focus lab: {url}\nEdits reload automatically. Use Prototype-Orbit.cmd stop to stop the managed server.")
    if args.open:
        webbrowser.open(url)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Prototype command failed: {error}", file=sys.stderr)
        raise SystemExit(1)
