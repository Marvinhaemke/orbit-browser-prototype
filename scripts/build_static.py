#!/usr/bin/env python3
"""Generate the static Vercel interface using the same adapters as local dev."""
from pathlib import Path
import shutil

from prototype_server import ROOT, PROTOTYPE, NATIVE, canvas_asset


def build():
    output = ROOT / "dist"
    if output.is_symlink() or output.resolve() != ROOT.resolve() / "dist":
        raise ValueError("Static output must be this repository's dist directory.")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for source in PROTOTYPE.rglob("*"):
        if source.is_file() and source.suffix in {".html", ".css", ".mjs", ".svg"}:
            destination = output / source.relative_to(PROTOTYPE)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
    index = output / "index.html"
    text = index.read_text(encoding="utf-8")
    if 'data-live-reload="true"' not in text:
        raise ValueError("The prototype must declare its local reload mode.")
    index.write_text(text.replace('data-live-reload="true"', 'data-live-reload="false"'), encoding="utf-8")
    for route, source in NATIVE.items():
        destination = output / route.lstrip("/")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(canvas_asset(route, source.read_text(encoding="utf-8")), encoding="utf-8")
    print(f"Built {len(list(output.rglob('*.*')))} static assets in dist.")
    return output


if __name__ == "__main__":
    build()
