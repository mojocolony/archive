# Archive — v0.1.0 Inspector

Archive is a privacy-first PWA for organizing and retrieving ChatGPT history. This first build is deliberately limited to the **Foundation + Import Inspector** milestone.

It does **not** import your conversations yet. It safely inspects the structure of an official ChatGPT export so the real parser can be built from the current export schema rather than guesses.

## What this build does

- Runs as a static PWA with no JavaScript package dependencies.
- Uses browser IndexedDB for local settings and import-history summaries.
- Reads a ZIP's central directory rather than loading the entire ZIP into memory.
- Supports ZIP64 metadata needed by multi-gigabyte archives.
- Reads only a bounded prefix of top-level JSON files to identify field names.
- Never stores prompt/reply values during inspection.
- Produces a **Safe Inspection Report** that omits attachment filenames and message values.
- Can download that safe report as JSON.
- Can optionally save the safe report in a Dropbox App Folder.
- Uses Dropbox OAuth authorization-code flow with PKCE and a short-lived access token.
- Contains no Dropbox app secret and stores no refresh token.

## Deploy to GitHub Pages

1. Create a new GitHub repository for Archive.
2. Upload the contents of this folder to the repository root.
3. In GitHub, open **Settings → Pages**.
4. Deploy from the `main` branch and repository root.
5. Open the resulting HTTPS URL.
6. Open **Settings** inside Archive and run **Storage Self Check**.

The Import Inspector works without Dropbox, so Dropbox setup can wait until after the first schema inspection.

## Inspect the real ChatGPT export

1. Open **Import**.
2. Choose the official ChatGPT export ZIP.
3. Select **Inspect Export**.
4. Review the structural report.
5. Select **Download Safe Report**.
6. Upload that small JSON report to the ChatGPT conversation where Archive is being developed.

Do **not** upload the original multi-gigabyte ChatGPT export to the repository.

## Optional Dropbox setup

Create a Dropbox API app with:

- Scoped access
- **App Folder** content access
- `files.content.write` for this inspector build
- The exact deployed Archive URL registered as an OAuth redirect URI

In Archive → **Settings**, paste the Dropbox **App Key** and choose **Connect Dropbox**.

The App Key is public OAuth client configuration. Never paste a Dropbox App Secret into Archive or commit one to the repository.

## Tests

The core modules use Node's built-in test runner and require no npm downloads:

```bash
npm test
```

## Current limitation

The browser-only IndexedDB/service-worker integration could not be executed in the build sandbox because its Chromium instance blocks local/file navigation by policy. Archive therefore includes a browser **Storage Self Check** for the deployed app. Core ZIP, JSON-shape, Dropbox PKCE, Dropbox repository, UI-rendering, and routing logic are covered by automated tests.

## Next milestone

After the Safe Inspection Report is available, build the schema-specific **Archive Import & Merge** layer:

- conversation parser
- canonical JSON/Markdown archive
- incremental merging by ChatGPT conversation ID
- attachment hashing/deduplication
- latest/previous source-ZIP retention
- import preview and verification
