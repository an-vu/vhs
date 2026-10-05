from pathlib import Path
from zipfile import ZipFile
import json
root = Path(__file__).resolve().parent.parent
with ZipFile(root / "dev/.rover-climb-backup.zip") as archive:
    manifest = json.loads(archive.read("manifest.json"))
    for name in manifest["paths"]:
        (root / name).write_bytes(archive.read(name))
    for name in manifest["absent"]:
        (root / name).unlink(missing_ok=True)
print("Restored the pre-climb About rover and settings.")
