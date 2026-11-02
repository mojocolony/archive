# Archive — v0.3.4 Dropbox Recovery Fix

Archive is a privacy-first local/Dropbox dashboard for ChatGPT exports.

## What's new

- Automatically checks the canonical Dropbox archive index when connected at startup.
- Restores a missing local conversation catalogue and import status from `/System/archive-index.json`, then rebuilds the disposable browser search index from archived conversation sources.
- Provides a **Restore from Dropbox** button in Settings to retry recovery manually.
- If the connected Dropbox app contains no index, or its index is invalid, Archive preserves the existing local catalogue and reports the problem rather than treating it as a new export.
- Recovery reads Dropbox data; it does not overwrite, reimport, or delete any Dropbox files. Archive-owned stars and tags remain in `/System/conversation-metadata.json` and are loaded separately.

Automatic reindexing can take time for large archives. Progress is displayed in the app. If building local search fails, the recovered catalogue is retained and search can be retried from Home.

## Existing features

Archive-owned stars, multiple tags, transcript cleanup, clickable URLs, and Open in ChatGPT remain unchanged. Binary attachment uploading and source ZIP retention remain future work.

## Deployment

GitHub Pages serves this repository's main branch. Confirm **v0.3.4** in the app footer after deployment. You do not need to import another ChatGPT export.
