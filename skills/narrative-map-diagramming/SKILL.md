---
name: narrative-map-diagramming
description: "Create simple SVG-first map explainers and campaign-orientation diagrams with clean labels, non-overlapping movement lines, and PNG previews."
metadata: {"clawdbot":{"emoji":"🗺️"}}
---

# Narrative map diagramming

Use for custom geography explainers, campaign-orientation maps, and other diagram-like visuals where the goal is fast comprehension, not cartographic completeness.

## Use when

- The user wants a map or geographic explainer built from scratch
- Historical maps are too busy and need a simplified companion visual
- Movement, flow, or stakes need to be shown with arrows and labels
- The output should stay editable after the first draft

## Core rules

- Build the source as SVG first, even if a PNG preview is also needed
- Keep the map narrative-first: only include geography that changes understanding
- Prefer 2-3 muted colors plus a neutral background
- Use thick rivers, clear labels, and minimal legend text
- Avoid overlapping arrows; route lines so the story reads left-to-right or top-to-bottom
- Save versioned outputs when iterating so earlier drafts remain recoverable

## Workflow

1. Decide the story the map needs to tell.
2. Pick only the essential features:
   - cities
   - rivers
   - regions
   - terrain zones
   - movement arrows
3. Sketch layout with generous spacing before adding detail.
4. Generate SVG source first.
5. Render a PNG preview for quick review.
   - If SVG -> PNG conversion fails, inspect the SVG as XML before assuming the converter is broken.
   - Check for malformed or duplicate attributes, bad tag structure, or other invalid SVG syntax.
   - Fix the SVG first, then retry conversion as a separate step.
6. Iterate based on readability:
   - de-conflict labels
   - separate arrows
   - simplify clutter
   - add only the next layer of nuance
7. Keep both the latest SVG and PNG beside the generator script.

## Good defaults

- Use a paper-toned background instead of pure white
- Treat the image as a story-orientation graphic, not a battlefield atlas
- Add one small explainer box for “why this geography mattered”
- Include a tiny “not to scale” note when the visual is deliberately schematic

## Local pattern used here

- Workspace generator scripts live under `/home/boovius/.openclaw/workspace/scripts/`
- Temporary rendered outputs live under `/home/boovius/.openclaw/workspace/tmp/`
- Current example generator:
  - `/home/boovius/.openclaw/workspace/scripts/generate_stalingrad_orientation_map.py`
- Current example outputs:
  - `/home/boovius/.openclaw/workspace/tmp/stalingrad-orientation-map.svg`
  - `/home/boovius/.openclaw/workspace/tmp/stalingrad-orientation-map.png`
  - `/home/boovius/.openclaw/workspace/tmp/stalingrad-orientation-map-v2.svg`
  - `/home/boovius/.openclaw/workspace/tmp/stalingrad-orientation-map-v2.png`

## If the user wants Notion integration

1. Finalize the SVG first.
2. Render a PNG for easy embedding/preview.
3. Keep the SVG path in the notes or companion docs so later edits do not require rebuilding from scratch.
4. If a prior version of the same map is already embedded on the Notion page, prefer updating or replacing that existing image block in place instead of appending a fresh duplicate on every revision.
