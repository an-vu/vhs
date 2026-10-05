#!/usr/bin/env python3
"""Serve this project on port 6969 and print its local network URL."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess


def main():
    try:
        result = subprocess.run(
            ["ipconfig", "getifaddr", "en0"],
            capture_output=True,
            text=True,
            check=True,
        )
        ip = result.stdout.strip() or "localhost"
    except (OSError, subprocess.CalledProcessError):
        ip = "localhost"

    handler = partial(
        SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent.parent)
    )
    with ThreadingHTTPServer(("", 6969), handler) as server:
        print(f"\nReady at http://{ip}:6969\n", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
