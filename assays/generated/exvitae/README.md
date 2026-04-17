# ExVitae Imported Assays

This folder is for generated, structured assay definitions synced from the adjacent
`../exvitae/exvitae/assays` catalog.

It is intentionally separate from hand-written assays like `assays/risk/APOL1/apol1.py`.

Current policy:

- import only `bioscript:variant:*` YAML assays here
- keep multi-variant and bespoke interpretation logic in hand-written assays
- regenerate this folder via `npm run sync:exvitae-assays`

The sync script also writes `catalog.json` so the app or tooling can inspect the
imported assay set without walking the filesystem.
