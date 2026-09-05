# Archive — v0.3.2 Transcript Rendering Fix

Archive is a privacy-first local/Dropbox dashboard for ChatGPT exports.

## What v0.3.2 changes

Archived conversation transcripts now render safe basic Markdown instead of exposing raw Markdown syntax. Bold, italics, headings, ordered and unordered lists, inline code, fenced code blocks, and safe HTTP/HTTPS links are rendered in the conversation view.

Internal ChatGPT citation tokens such as `citeturn…` and `filecite…` are removed from visible archived transcripts and search excerpts. Raw HTML remains escaped, and unsafe Markdown link schemes are not converted into clickable links.

## Existing v0.3.x organization features

- Archive-owned stars, separate from ChatGPT-exported starred state.
- Multiple Archive tags per conversation.
- Optimistic tag/star updates with background Dropbox synchronization.
- Starred and Tags sidebar views.
- Tags included in the local search index.
- Canonical Archive organization metadata stored separately in Dropbox at `/System/conversation-metadata.json`.
- **Open in ChatGPT ↗** opens the source conversation in a new tab using the exported conversation ID.

## Important scope notes

Archive still treats the committed Dropbox conversation archive as canonical evidence. Transcript rendering changes only how archived text is displayed; it does not rewrite the archived source data.

Binary attachment upload and latest/previous source-export ZIP retention remain future work.

## Deploy

Upload the contents of the `Archive-v0.3.2-Transcript-Rendering-Fix` folder to the root of the `mojocolony/archive` GitHub repository and let GitHub Pages deploy normally. Open Archive and confirm **v0.3.2** in the lower-left corner.

No search-index rebuild is required for this update.
