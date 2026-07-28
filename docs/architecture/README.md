# Architecture docs

| File | What it is | Use it for |
|---|---|---|
| [`architecture.md`](architecture.md) | Six Mermaid views + narrative | Reading in the repo / GitHub, pasting into Notion, Obsidian, Confluence |
| [`carrot-architecture.drawio`](carrot-architecture.drawio) | 4-page pre-laid-out diagram | Whiteboard tools — Miro, draw.io, Lucidchart, Confluence |

Both cover the same system; the Markdown has more prose, the `.drawio` is the one
you can drag boxes around in.

## Getting it into Miro

Miro does not import `.drawio` natively — the reliable routes are:

1. **draw.io → PDF/PNG → Miro.** Open `carrot-architecture.drawio` at
   [app.diagrams.net](https://app.diagrams.net) (File → Open From → Device), then
   *File → Export as → PDF* with **All Pages** checked. Drag the PDF onto a Miro
   board — each page lands as its own image. Fastest, but not editable in Miro.
2. **draw.io → SVG → Miro** (*File → Export as → SVG*, one file per page). Miro
   ingests SVG as vector, so it stays sharp at any zoom; still not natively editable.
3. **Miro's Mermaid support.** Miro's AI diagram feature accepts Mermaid — paste any
   single code block from `architecture.md` and you get native, editable Miro shapes.
   Do it one block at a time; the big flowcharts import better than the ER diagram.

For an editable diagram without the conversion dance, [app.diagrams.net](https://app.diagrams.net)
itself (or the Confluence/Notion draw.io plugin) opens the file directly with the
layout intact.

## Pages / views

1. **System context & deployment** — clients, Caddy, the five containers, external
   services, CI/CD.
2. **Recipe import pipeline** — job queue, the URL strategy cascade (JSON-LD →
   microdata → domain parsers → stripped HTML; caption → linked pages → video
   transcript), save, retry, failure codes.
3. **Gemini prompt chain** — the two-phase extract-then-enrich split, every system
   prompt's actual contract, the validation loop, and the deterministic repair layer
   that runs after the model.
4. **Data model, realtime & semantic search** — tables and their relationships, the
   two different SSE mechanisms, worker loops, and the embedding lifecycle.

## Keeping them current

The diagrams are hand-written, not generated from code. The parts most likely to drift:

- prompt text in `services/api/src/api/services/gemini.py` (view 3),
- the strategy cascade in `services/api/src/api/services/pipeline.py` (view 2),
- new tables in `services/api/src/api/models.py` (view 4).

`carrot-architecture.drawio` was produced by a throwaway generator script; edit the
XML directly (or in draw.io) rather than looking for the script.
