#!/usr/bin/env python3
"""Restore files changed by the cleanup; later edits to those files are overwritten."""

import json
from pathlib import Path
from zipfile import ZipFile


def restore(root, backup):
    with ZipFile(backup) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        for name in manifest["paths"]:
            destination = (root / name).resolve()
            if not destination.is_relative_to(root.resolve()):
                raise ValueError(f"Invalid backup path: {name}")
            if name in manifest["absent"]:
                destination.unlink(missing_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(name))
    print("Restored the files changed by the cleanup.")


if __name__ == "__main__":
    directory = Path(__file__).resolve().parent
    restore(directory.parent, directory / ".cleanup-backup.zip")
