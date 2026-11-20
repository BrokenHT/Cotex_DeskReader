# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cotex is an Electron + React desktop novel reader styled as a work-chat UI (two skins: Codex and WorkBuddy). It imports local TXT and DRM-free EPUB, and reads public chapters from five online sources. The library is local-only; user data lives in `%APPDATA%\DeskReader` (path intentionally kept from the old DeskReader name — do not rename it).

Requirements: Node.js 22.12+, Windows x64 is the primary target. `README.txt` holds detailed feature/history notes in Chinese.

## Commands

```bash
npm ci                 # install; if Electron's postinstall was skipped: node node_modules/electron/install.js
npm run build          # Vite build to dist/
npm start              # Electron loads dist/index.html — build first
npm run dev            # Vite dev server at 127.0.0.1:5173
DESKREADER_DEV_URL=http://127.0.0.1:5173 npm start   # dev with HMR
npm test               # node:test unit files: core, cotex, sources, window, epub-images, rich-epub, rich-store
node --test tests/core.test.cjs                      # single test file
node --test --test-name-pattern "EPUB spine" tests/core.test.cjs   # single test
npm run test:ui        # Playwright _electron E2E (tests/e2e.cjs)
npm run test:rich-ui   # rich EPUB E2E: table, MathML, figure, footnote modal (tests/rich-content.e2e.cjs)
node tests/appearances.e2e.cjs                       # other E2E scripts run directly
node tests/cotex-ui.cjs
node tests/sources-ui.cjs
node node_modules/electron/cli.js tests/electron-network.cjs   # network probes run under Electron
npm run dist           # build + electron-builder Windows portable/NSIS into release/
node scripts/build-icon.cjs                          # regenerate icons from assets/icon-artwork.png
```

Env overrides: `DESKREADER_DATA` (alias `COTEX_DATA`) redirects `userData`; tests point it at `test-results/` (gitignored). `COTEX_DEV_URL` is an alias of `DESKREADER_DEV_URL`.

## Architecture

### Process split

- `electron/main.cjs` — window lifecycle, menu, all IPC. Privileged work (filesystem, parsing, network) lives only here. Every IPC method is registered through the local `handler()`, which rejects calls not coming from the app's own main frame; new privileged methods must use it, not `ipcMain.handle` directly.
- `electron/preload.cjs` — exposes only `window.desk` via `contextBridge`. The renderer has `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, no navigation/window-open, CSP `default-src 'self'` with `img-src 'self' data:`. Adding a renderer capability means adding a preload method plus a matching main handler.
- `src/` — React SPA. `main.jsx` holds the entire `App` component and most state (no router/state library); other components are split into `appearance.jsx`, `work-summary.jsx`, `work-hints.jsx`, `buddy-*.jsx`, `rich-content.jsx`, etc. Styles: `style.css` (Codex base) + `appearances.css` + `buddy-sidebar.css` + `work-summary.css` + `codex-typography.css` + `rich-content.css`.

The frameless window close is a handshake: main intercepts `close`, sends `prepare-close` via the `action` channel, the renderer flushes reading progress, then calls `api.window('close')`.

### Persistence (`electron/store.cjs`)

- `library.json` — `{version, books: [summary...], settings, activeId, seeded, appearanceVersion}`.
- Per book: `books/<id>.json` (full text + `media` base64 images) and `books/<id>.json.state` (alias, progress, bookmarks, collapsed, collapsedImages). Progress patches only rewrite the small `.state` sidecar, never the big book file. Images are open by default; `collapsedImages` holds the `chapter:paragraph` keys the reader folded closed.
- Writes are atomic (`.tmp` → rename) and keep a `.bak`; reads fall back to `.bak`. Removing a book moves it to `trash/`.
- Book id is `sha256(identity)` truncated to 24 hex chars; `file(id)` validates that format.
- Re-importing the same EPUB with a higher `contentVersion` runs `epub-upgrade.cjs`: chapters are matched by `epubPath` (then title fallback) so alias, progress, bookmarks, and collapsed state survive while images get filled in.
- Backup format is `DeskReaderBackup` v1 (JSON, includes media and rich content). `electron/backup.cjs` validates every field, bounds rich HTML/notes (2 MB per block, 50 MB per book, 5000 notes), and re-sanitizes SVG media on restore.

### Parsing (`electron/core.cjs`, `electron/epub-images.cjs`)

- `parseTXT`: encoding detection (UTF-16 BOM, strict UTF-8, else GB18030), Gutenberg boilerplate stripping, chapter-heading regex for Chinese/English numerals, merging duplicate consecutive chapter titles, auto-segmentation (~6000 chars) when no headings exist, long paragraphs split at 1600 chars.
- `parseEPUB` is hand-written on generic libs (`jszip` + `fast-xml-parser` + `cheerio`), not an EPUB library: container.xml → OPF → spine order → per-file XHTML. Guards: 60 MB file / 20k entries / 150 MB uncompressed limits, `META-INF/encryption.xml` rejected (DRM), `resolveEntry()` blocks path traversal, scripts/styles/iframes/forms removed.
- Rich parsing lives in `electron/rich-content.cjs`. Before any chapter is parsed, `premarkNotes()` scans every spine file so a notes/endnotes file placed before the referencing chapter cannot leak note text into the reading flow. Per chapter, `createRichParser().parseChapter()` removes the first h1/h2/h3 as the title, resolves same-file and cross-file `noteref` links into `notes` (deduped by target, backlinks stripped), and walks block structure into `rich`.
- `electron/epub-toc.cjs` reads the EPUB 3 nav document or EPUB 2 NCX. `parseChapters()` splits a spine document at its TOC anchors when several entries point into it (common for InDesign/Kindle exports that put a whole book into one XHTML file), and filters notes to the segments that reference them. Documents without a TOC keep the single-chapter heading fallback. Split chapters get an `epubPath` suffix (`#fragment`, `#front`, `#start`) so re-import matching stays unique.
- `paragraphs` is always the flattened plain text of every block, used by search, summaries, progress and bookmarks. `rich` is keyed by paragraph index: `{type: 'text'|'table'|'math'|'figure'|'list'|'quote'|'code'|'html', html}`. Text/table/etc. preserve inline markup, tables with captions/spans, MathML (with TeX annotation fallback text), figures, lists, quotes, code and headings.
- EPUB images (PNG/JPEG/GIF/WebP/AVIF/SVG) are read from the zip, detected by magic bytes, converted to `data:` URLs, deduplicated into `book.media` keyed by a 24-hex sha256, and collected into `chapter.images: [{paragraph, items}]` gallery anchors at their block position. The parser strips those images from `rich` HTML so a thumbnail gallery is the single display path; images inside notes stay inline in the note modal. External image URLs are never fetched; SVGs are sanitized to a whitelisted attributes-only form. Max 20 MB per image.
- Parser-side sanitization (`sanitizeHtml` in `rich-content.cjs`) is an allowlist: script/style/form/media tags removed, non-note anchors unwrapped, unknown tags unwrapped, all style/class/id/event/href/src attributes stripped, external/missing images replaced by an accessible placeholder span, and note refs restricted to `role="doc-noteref"` + `data-note-id`.
- Chapter data model: `{id, title, paragraphs, rich?, notes?, images?, url?, locked?, epubPath?}`; `contentVersion` is 5 for current rich/TOC EPUBs. `paragraphs:null` means "not cached yet" for online books. Legacy EPUB chapters without `rich` still render through the plain paragraph path.
- `chapterMatches` scores chapter jumps: exact Chinese/Arabic numeral match, then substring, then position.
- OpenCC simplify/traditional conversion is for display and search matching only; stored text is never converted. Rich blocks convert text nodes at display time only.
- `src/rich-content.jsx` runs a second DOMPurify pass, resolves `data-asset` only against `book.media` (must be a `data:image/*` URL), strips links/events again, and makes note refs mouse- and keyboard-activatable (Enter/Space). `RichBlock` renders text as `<p class="rich-text">` and other blocks as `.rich-block.rich-<type>` with `data-chapter`/`data-paragraph` anchors; `RichNote` renders note bodies in the modal. Styles are scoped in `src/rich-content.css` (tables scroll horizontally; math, figures, lists, quotes, code, note refs).

### Online sources (`electron/sources.cjs`, `electron/extra-sources.cjs`)

- `Sources` is constructed with `net.fetch` from main. Its `request()` enforces the `isSourceURL` allowlist (https, exact host set, no credentials/port), 25 s timeout, size caps, post-redirect origin checks, and content-length completeness.
- Sources: `gutenberg` (Gutendex API + gutenberg.org text; offline fallback catalogue in `assets/gutenberg-catalog.json`), `sfacg`, `17k`, `zongheng`, `wikisource`. `all` searches run in parallel and interleave results, tolerating per-source failures with warnings.
- Online books store only the chapter list (`url`, `locked` for VIP, `paragraphs:null`). `chapter()` fetches and caches one chapter on demand; the renderer triggers this and main writes the chapter back into the latest book. VIP/login-gated chapters throw and must not be substituted with fake content.
- `withCatalog` remaps progress, bookmarks, and collapsed chapters by chapter URL when a catalogue is refreshed, so position survives reordering.
- Adding a source requires: host in `SOURCE_HOSTS`, entry in `EXTRA_SOURCES`/`SOURCE_LIST`, adapter functions (`searchExtra`, `addExtra`, `chapterExtra`/`extraCatalog`), and the UI picks it up from `SOURCE_LIST`.

### Reader UI conventions

- `settings.appearance` switches `codex` / `workbuddy`; book data is shared, only presentation differs. Profile (avatar/nickname) is stored separately per appearance (`electron/profile.cjs`).
- Sidebar shows the book's `alias` (a work-style title assigned in `finalizeBook`); the real `title` appears on hover.
- The "work summary" / hints are cosmetic UI: pressing Space toggles a fake assistant summary. Its copy must stay generic — never include the book title, author, chapter title, or novel text (see the comment at the top of `src/work-summary.jsx`). No AI calls are made anywhere.
- Reading progress is debounced `api.patch(id,{progress})`; restoring uses a scroll anchor (`data-chapter` / `data-paragraph` attributes). `src/progress.mjs` computes shared progress math.

## Testing notes

- Unit tests use Node's built-in runner and exercise `electron/*.cjs` directly. `tests/core.test.cjs` depends on the four bundled Gutenberg texts in `assets/`, and writes fixtures to `tests/fixtures/`. `tests/rich-epub.test.cjs` builds EPUBs in memory (tables, MathML, figures, notes, NCX/nav TOCs) and `tests/rich-store.test.cjs` covers rich persistence/backup validation and v2→v3 upgrades.
- E2E scripts launch the real app with Playwright `_electron` and an isolated `DESKREADER_DATA`/`COTEX_DATA` under `test-results/`; `tests/e2e.cjs` expects the four first-run seeded books, while `tests/rich-content.e2e.cjs` pre-seeds one rich book and sets `seeded=true`, so it expects one book row. Rich E2E verifies table/MathML/SVG figure rendering, the footnote modal (click + keyboard), the default-open thumbnail gallery with inline image expansion, no horizontal page overflow, and persistence across restart.
- Several `tests/*.cjs` scripts are manual/diagnostic (network probes, packaged-app checks) and are not part of `npm test`.
