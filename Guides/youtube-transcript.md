# YouTube Transcript Pipeline

End-to-end guide to the pipeline that turns a YouTube URL on Chris's
phone into a plain-text transcript ready to paste into ChatGPT, Notes,
or Files.

This document is written so a fresh AI session (or a fresh human) can
rebuild the entire chain from zero. Verify against the referenced
source files before changing anything.

---

## 1. Architecture Overview

YouTube's `timedtext` (captions) endpoint now refuses raw requests
that don't carry a Proof-of-Origin Token computed by a JS challenge
inside the watch page. Scriptable, plain `fetch`, `curl`, and even
yt-dlp without a session cookie all fail. Real Chromium solves the
PoT natively, so we let Chromium do the captioned fetch from inside
the YouTube page context and just relay the JSON.

Data flow:

```
[iPhone — Share Sheet, Shortcut, or Scriptable manual run]
  |
  v supplies a YouTube URL to
[Scriptable — scriptable/youtube-transcript.js]
  |   POST /extract
  |   Authorization: Bearer INGEST_TOKEN
  |   body: { url, lang?, preferManual? }
  v
[Cloudflare Worker — youtube-transcript-worker]
  |   puppeteer.launch(env.BROWSER)         // Browser Rendering
  |   page.goto(https://www.youtube.com/watch?v=<id>)
  |   waitForFunction(ytInitialPlayerResponse.captions.captionTracks)
  |   pickTrack(tracks, lang, preferManual)
  |   page.evaluate(fetch(track.baseUrl + '&fmt=json3'))   // PoT comes free
  |   eventsToText(events)
  v
[Scriptable]
  |   formats header + transcript
  |   Pasteboard.copy(out)
  |   Script.setShortcutOutput(out)
  v
[Shortcuts]
      Optional "Copy to Clipboard" backup step in case Pasteboard
      access is sandboxed, then any downstream action (ChatGPT,
      Notes, Files, Markdown editor, ...).
```

The Worker holds no GitHub or utpap.com credentials. It only talks to
youtube.com via the headless browser, and replies to the iPhone with
JSON. Its only secret is the shared Bearer token.

---

## 2. All URLs and Endpoints

| URL | Purpose |
|---|---|
| `https://youtube-transcript-worker.chris-guadarrama.workers.dev/extract` | Cloudflare Worker POST endpoint. Accepts JSON `{url, lang?, preferManual?}` with a Bearer auth header. Live production path. |
| `https://youtube-transcript-worker.chris-guadarrama.workers.dev/` | Health probe. Returns `youtube-transcript-worker` with 200, no auth. |
| `https://www.youtube.com/watch?v=<id>` | Watch page Chromium loads inside the Worker. The Worker reads `window.ytInitialPlayerResponse` from this page. |
| `<track.baseUrl>&fmt=json3` | `timedtext` endpoint, fetched FROM INSIDE the page context so it inherits the PoT and session cookies. Never called directly by the Worker, always via `page.evaluate`. |

---

## 3. Secrets and Tokens

One secret keeps the chain authenticated.

### 3.1 `INGEST_TOKEN`

- What: Shared Bearer between the Scriptable client and the Cloudflare
  Worker. Authorizes the `POST /extract`.
- Where it lives:
  - Scriptable script: hardcoded at the top of
    `scriptable/youtube-transcript.js` as
    `const INGEST_TOKEN = "..."`. The repo ships with the placeholder
    `PASTE_INGEST_TOKEN_HERE`; replace it on the device after deploy.
  - Cloudflare Worker: stored as a Worker secret named `INGEST_TOKEN`
    (set via `wrangler secret put INGEST_TOKEN`).
- How to rotate:
  1. `openssl rand -hex 16` for a new value.
  2. `cd cloudflare/youtube-transcript-worker && wrangler secret put INGEST_TOKEN`,
     paste the new value.
  3. Update `INGEST_TOKEN` in `scriptable/youtube-transcript.js` and
     re-paste the script into the Scriptable app on the iPhone.
- Mismatch symptom: HTTP 401 from the Worker, body
  `{"ok":false,"error":"unauthorized"}`.

### 3.2 No other secrets

The Worker holds no GitHub token, no Notion token, no utpap.com
credentials. It is intentionally narrow in scope.

---

## 4. Cloudflare Worker — Setup From Zero

Code lives at `cloudflare/youtube-transcript-worker/`.

Files to read before touching anything:

- `cloudflare/youtube-transcript-worker/src/worker.js` — Worker code.
- `cloudflare/youtube-transcript-worker/wrangler.toml` — config. The
  `[[browser]]` block is what wires `env.BROWSER` to Cloudflare's
  Browser Rendering service. No `[triggers]` block; HTTP-only.
- `cloudflare/youtube-transcript-worker/package.json` —
  `@cloudflare/puppeteer` dependency.
- `cloudflare/youtube-transcript-worker/README.md` — deploy notes.

Setup:

```sh
# 1. Install Wrangler (once per machine).
npm install -g wrangler

# 2. Move into the Worker dir + install deps.
cd cloudflare/youtube-transcript-worker
npm install

# 3. Auth Cloudflare (opens browser).
wrangler login

# 4. Enable Browser Rendering for the account (once per account).
#    Cloudflare dashboard -> Workers & Pages -> Browser Rendering
#    -> Get started. Free tier is fine.

# 5. Generate + store the shared secret.
openssl rand -hex 16
wrangler secret put INGEST_TOKEN

# 6. Deploy.
wrangler deploy
```

Wrangler prints the worker URL after deploy. It will look like
`https://youtube-transcript-worker.<account-subdomain>.workers.dev`.
Paste that URL into `scriptable/youtube-transcript.js` as `WORKER_URL`
(with `/extract` appended). Paste the matching `INGEST_TOKEN`.

Operations:

- Live logs: `wrangler tail`
- Cloudflare dashboard: Workers + Pages -> `youtube-transcript-worker`
  -> Logs.
- Manual smoke test:
  ```sh
  curl -sS -X POST \
    -H "Authorization: Bearer <INGEST_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
    https://youtube-transcript-worker.chris-guadarrama.workers.dev/extract
  ```
  Expect `{"ok":true,"videoId":"dQw4w9WgXcQ",...}` within ~10 seconds.

---

## 5. iOS Shortcut — Setup From Zero

The Shortcut is the on-device entry. One Run Script action, optionally
chained with Copy to Clipboard for sandbox safety.

Steps:

1. Shortcuts app -> "Shortcuts" tab -> "+" top right.
2. Add Action -> search "Run Script" -> pick "Run Script" under the
   Scriptable category.
3. In the action: Script = `youtube-transcript`. Run In App = on.
   Show When Run = off.
4. (Optional but recommended) Add a second action: "Copy to Clipboard"
   with input = "Shortcut Input" from the Run Script result. This is
   the backup for the case where Scriptable's Pasteboard access is
   sandboxed.
5. (Optional) Add a third action: "Show Notification" or "Show Result"
   to confirm completion when the Shortcut is fired from outside the
   Shortcuts app.
6. Settings (gear icon) -> "Show in Share Sheet" on, "Share Sheet
   Types" set to URLs + Text. That enables Share Sheet input.
7. Name the Shortcut `youtube-transcript` (matches what Scriptable
   expects to be invoked as).
8. Save.

Manual test: in Safari, hit Share -> `youtube-transcript`. The
clipboard should hold the transcript a few seconds later.

---

## 6. Scriptable Script — Setup From Zero

App: Scriptable from the App Store (free, by Simon B. Stovring).

Steps:

1. Open Scriptable.
2. Tap "+" top right -> creates a new untitled script.
3. Rename it to `youtube-transcript` (tap the title bar). Must match
   the name referenced by the Shortcut.
4. Paste the full source from
   `scriptable/youtube-transcript.js`.
5. Replace the placeholder `INGEST_TOKEN` with the value from
   `wrangler secret put INGEST_TOKEN`.
6. Verify `WORKER_URL` matches the URL wrangler printed.
   `PREFERRED_LANG` can stay `"en"` unless you actually want a
   different language.
7. Run once from the Scriptable app to confirm the alert.

Input flow inside the script:

- Share Sheet URL -> `args.urls[0]`.
- Share Sheet plain text containing `youtu` -> `args.plainTexts[0]`.
- Shortcut parameter (text or URL) -> `args.shortcutParameter`.
- Manual run -> Alert with a single text field.

---

## 7. Testing and Verification

End-to-end smoke test:

1. **Curl the Worker directly** (above) -> expect `ok:true`.
2. **Run the Scriptable script from the app**: tap Play, paste a
   YouTube URL in the prompt -> expect "Transcript copied" alert
   showing char count and language.
3. **Share Sheet test**: open a YouTube video in Safari, tap Share,
   pick the `youtube-transcript` Shortcut -> clipboard holds the
   transcript.
4. **Shortcuts chain test**: build a Shortcut "Run Script (Scriptable,
   `youtube-transcript`)" -> "Show Result". Run from the home screen
   with no input; the manual prompt should appear, accept a URL, and
   the result view should render the transcript.

Common failures and what they mean:

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 from Worker | `INGEST_TOKEN` mismatch | Re-paste in Scriptable, or rotate per Section 3.1 |
| 400 "Couldn't extract video ID" | URL form not recognized | Paste a `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, or `/embed/` URL |
| 400 "No captions available on this video" | Video genuinely has no captions, manual or auto | Pick a different video; the Worker can't invent text from audio |
| 502 "timeout after 25000ms" | Browser session stuck loading watch page; rare, usually transient | Retry. If persistent, check `wrangler tail` for the underlying error |
| 502 "fetch 4xx" | YouTube changed `timedtext` again | Read Worker logs; likely needs a wait-condition tweak or UA bump |
| iOS banner "Could Not Run Run Script" | Missing `Script.setShortcutOutput` after edits | Both success + catch branches already call it; don't strip those lines |

---

## 8. Cost and Quota Notes

- Workers Free tier includes 10 minutes of Browser Rendering per day.
- Workers Paid lifts that to 10 hours per month.
- Each transcript call uses roughly 8 to 12 seconds of browser time
  (page load + waitForFunction + one in-page fetch). Call it 10s
  average.
- 10 min/day / 10s per call = about 60 transcripts per day on Free.
- The bulk of the cost is `page.goto` + DOM construction; the
  `timedtext` fetch itself is sub-second. There is no obvious way to
  drop the browser entirely while still solving the PoT challenge.

---

## 9. References

Files to read for ground truth:

- `scriptable/youtube-transcript.js` — iPhone-side script.
- `cloudflare/youtube-transcript-worker/src/worker.js` — Worker code.
- `cloudflare/youtube-transcript-worker/wrangler.toml` — Worker config.
- `cloudflare/youtube-transcript-worker/package.json` —
  `@cloudflare/puppeteer` dependency.
- `cloudflare/youtube-transcript-worker/README.md` — deploy notes.

Related guides:

- `Guides/forsale.md` — sibling Cloudflare Worker (KSL scraper). Same
  Worker secrets pattern + iOS Shortcut + Scriptable layout.

If the chain breaks in a way not covered here, the diagnostic order is:
Scriptable alert -> Worker `wrangler tail` -> `curl /extract` directly
to isolate Worker-vs-client -> Cloudflare dashboard Browser Rendering
metrics. Whichever step shows the failure is the one that broke.
