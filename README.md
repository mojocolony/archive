# Archive — v0.3.3 Transcript Cleanup Fix

Archive is a privacy-first local/Dropbox dashboard for ChatGPT exports.

## What v0.3.3 changes

Archived transcripts and search excerpts now remove standalone ChatGPT memory-citation markers such as `memcite`, in addition to the `cite` and `filecite` wrappers already cleaned up in v0.3.2. These are display-only changes; the canonical archived source remains untouched.

Plain HTTP/HTTPS URLs written directly into a conversation are now made clickable in the transcript view, including long product links. Sentence punctuation after a URL remains outside the link. Existing Markdown links continue to open in a new tab, and unsafe URL schemes are not converted into clickable links.

## Existing v0.3.x organization features

- Archive-owned stars, separate from ChatGPT-exported starred state.
- Multiple Archive tags per conversation.
- Optimistic tag/star updates with background Dropbox synchronization.
- Starred and Tags sidebar views.
- Tags included in the local search index.
- Canonical Archive organization metadata stored separately in Dropbox at `/System/conversation-metadata.json`.
- **Open in ChatGPT ↗** opens the source conversation in a new tab using the exported conversation ID.

## Important scope notes

Archive still treats the committed Dropbox conversation archive as canonical evidence. Transcript cleanup changes only how archived text is displayed; it does not rewrite the archived source data.

Binary attachment upload and latest/previous source-export ZIP retention remain future work.

## Deploy

Upload the contents of the `Archive-v0.3.3-Transcript-Cleanup-Fix` folder to the root of the `mojocolony/archive` GitHub repository and let GitHub Pages deploy normally. Open Archive and confirm **v0.3.3** in the lower-left corner.

No search-index rebuild is required for this update.
