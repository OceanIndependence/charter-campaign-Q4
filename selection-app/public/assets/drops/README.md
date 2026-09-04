# Dropped demo images

These are the images you dropped onto the page's image slots (they live in
browser state, so the static export didn't carry them).

Each file is named after its slot:

- `ys-<yacht>-lead.webp` — ring-card lead image (2000x1250 slot)
- `ys-<yacht>-t1/t2/t3.webp` — spec-panel thumbnails (interior / deck / watertoys)
- `lucy-photo.webp` — consultant portrait

## To add them to the deployed site

1. Copy this folder into the export as `assets/drops/`.
2. In `/yacht-selection/index.html`, the slots fall back to their `src`
   attribute — point each slot's `src` at `/assets/drops/<file>` (or hand the
   files to me and I'll wire them into the source pages and re-export).
