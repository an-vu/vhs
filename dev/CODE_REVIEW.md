# Cleanup completed

## Changes

- Removed unused `.home-link` / `.home-link:hover` and `.effect-category` CSS.
- Removed standalone F-35 and RB18 lab pages and their dedicated scripts. Both models remain available in `dev/lab/spatial-lab.html`.
- Removed the obsolete Curiosity redirect and the standalone website prototype. The model playground and entrance playground remain.
- Removed macOS `.DS_Store` files and added ignores for them, Python bytecode, and the local cleanup backup.
- Moved project deep-link handling into `StudioContentList`, sharing exclusive-details and scrolling behavior. Hash openings scroll instantly once; manual openings keep smooth scrolling unless reduced motion is enabled.
- Compacted point-material JavaScript setup; the fragment shader is byte-for-byte unchanged.
- Updated README to remove the deleted redirect reference and document restoring the cleanup.

## Revert

Run from the project root:

```bash
python3 dev/revert-cleanup.py
```

The backup is `dev/.cleanup-backup.zip`. Restore overwrites later edits to the 21 affected paths and removes files that did not exist before cleanup, including the newly added `.gitignore`. It does not move the server or lab out of `dev/`. The restore tool and backup remain available afterward. Keep the backup locally and exclude it from deployments; `.gitignore` alone does not control deployment uploads.

## Retained

Shared production modules, model assets, the entrance lab, legal/work styles, and the 404 page are still used. Repeated page markup/import maps, splitting the model playground into more modules, and adding lifecycle teardown for a future client-rendered app remain architectural options. They were not needed to remove current dead code and would broaden the behavior changes.

## Verification

- JavaScript syntax checks passed for all 35 remaining script files using the Mac's JavaScriptCore runtime. Module loading requires browser dependencies, so these checks do not establish successful WebGL execution.
- Executed the shared details handler with DOM stubs: initial and changed hash links, exactly one scroll on opening, links to already open details, exclusive opening, malformed and out-of-container hashes, manual scrolling, and reduced-motion behavior passed.
- Verified backup archive integrity and restored every affected path in a temporary directory, comparing bytes with the backup.
- Verified the point fragment shader is unchanged and Python files parse.
- Browser rendering and WebGL interactions have not been tested.
- All 125 remaining local HTML, JS, and CSS references resolve; import maps parse.
