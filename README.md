# Archive — v0.3.5 Dropbox Rate-Limit Recovery

Archive is a privacy-first local/Dropbox dashboard for ChatGPT exports.

## What's new in v0.3.5

- Dropbox uploads run one conversation at a time by default, with 350 ms pacing between API requests to reduce bursts.
- Automatic retries now use progressively longer pauses for Dropbox HTTP 429 and temporary 5xx errors, transient network failures, and timeouts.
- Honors the Dropbox `Retry-After` header (seconds or HTTP date), with fallback to `retry_after` in a Dropbox JSON response.
- During waits, import progress explains why Archive is paused and when it will retry.
- If retry attempts are exhausted, Archive safely stops; a second import attempt reads Dropbox's existing JSON/Markdown filenames and skips conversation versions already completed.
- If a multi-worker import was explicitly requested, Archive now waits for all in-flight uploads to settle before returning an error.
- The canonical `/System/archive-index.json` is still committed only **after** all conversation uploads and attachment metadata have completed. Interrupted imports do not mark a partial update as committed.

## Resuming an interrupted import

1. Open Archive v0.3.5 and reconnect Dropbox if necessary.
2. Select the same ChatGPT export ZIP and click **Analyze Export**.
3. Review the import preview and choose **Import Conversations to Dropbox**.
4. Archive checks which conversation versions already have both JSON and Markdown files, skips those, and uploads only incomplete ones.
5. Wait for the import-committed message; then rebuild search if needed.

Do not delete the original ZIP until the import is complete. A refresh resets the browser's selected file, so you must select and analyze it again.

## Existing features

The v0.3.4 restore-from-Dropbox capability, archive-owned stars and tags, transcript cleanup, and original-file preservation remain unchanged.

## Deployment

GitHub Pages serves the repository's `main` branch. Confirm **v0.3.5** in the Archive footer after deployment.
