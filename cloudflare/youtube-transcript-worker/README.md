# youtube-transcript-worker

Cloudflare Worker that returns the transcript for a YouTube video. Drives
a headless Chromium via Cloudflare Browser Rendering, reads the page's
own `ytInitialPlayerResponse`, picks a caption track, then fetches the
`timedtext` URL from inside the page so the request inherits YouTube's
session + the JS-computed Proof-of-Origin Token. The iPhone-side
Scriptable script (`scriptable/youtube-transcript.js`) is now a thin
client that POSTs here and renders the response.

## Why this shape

YouTube's `timedtext` endpoint now refuses raw requests that don't carry
a PoT (Proof-of-Origin Token) computed by an in-page JS challenge.
Scriptable, plain `fetch`, and `curl` can't satisfy that. Real Chromium
solves it natively, so the heaviest tool (a real browser) is the only
tool that works. Cloudflare Browser Rendering gives us that browser
without standing up our own headless-Chrome infra.

```
[iPhone — Scriptable]
  POST /extract  Bearer INGEST_TOKEN
  body: { url, lang?, preferManual? }
        |
        v
[Cloudflare Worker — youtube-transcript-worker]
  puppeteer.launch(env.BROWSER)
  page.goto(https://www.youtube.com/watch?v=<id>)
  waitForFunction(ytInitialPlayerResponse.captions...)
  page.evaluate(fetch(track.baseUrl + '&fmt=json3'))  // PoT comes free
        |
        v
  { ok, videoId, title, channel, language, isAutoCaption,
    charCount, transcript }
```

## POST contract

```
POST https://youtube-transcript-worker.<your-sub>.workers.dev/extract
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "lang": "en",            // optional, default "en"
  "preferManual": true     // optional, default true
}
```

Success (200):
```
{
  "ok": true,
  "videoId": "dQw4w9WgXcQ",
  "title": "...",
  "channel": "...",
  "language": "en",
  "isAutoCaption": false,
  "charCount": 1234,
  "transcript": "line one\nline two\n..."
}
```

Errors return `{ ok: false, error: "<message>" }` with 400 (bad input,
no captions), 401 (bad/missing Bearer), or 502 (browser/upstream
failure).

## One-time setup

```sh
# 1. Install deps (once per machine).
npm install -g wrangler
cd cloudflare/youtube-transcript-worker
npm install                              # pulls @cloudflare/puppeteer

# 2. Auth Cloudflare (opens browser).
wrangler login

# 3. Enable Browser Rendering for the account.
#    Cloudflare dashboard -> Workers & Pages -> Browser Rendering -> Get started.
#    Required once per account, free tier is fine.

# 4. Generate + store the shared secret.
openssl rand -hex 16                     # copy the value
wrangler secret put INGEST_TOKEN         # paste it when prompted

# 5. Deploy.
wrangler deploy
```

Wrangler prints the worker URL after deploy. It will look like
`https://youtube-transcript-worker.<your-sub>.workers.dev`. Paste that
URL into `scriptable/youtube-transcript.js` as `WORKER_URL` (with
`/extract` appended) and paste the matching `INGEST_TOKEN`.

## Smoke test

```sh
curl -sS -X POST \
  -H "Authorization: Bearer <INGEST_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  https://youtube-transcript-worker.<your-sub>.workers.dev/extract \
  | head -c 800
```

Expect `{"ok":true,"videoId":"dQw4w9WgXcQ",...}` within ~10 seconds.

## Operations

- Live logs: `wrangler tail`
- Each call uses roughly 8 to 12 seconds of browser time. Free-tier
  budget is 10 minutes of browser time per day, so about 50 transcripts
  per day before throttling. Workers Paid lifts that to 10 hours per
  month.
- Rotate the token: regenerate, `wrangler secret put INGEST_TOKEN`,
  paste the new value, update `scriptable/youtube-transcript.js` on
  the iPhone.
- Disable: `wrangler delete`.

## Files

- `src/worker.js` — Worker code.
- `wrangler.toml` — name, compat date, `[[browser]]` binding. No
  `[triggers]`; HTTP-only.
- `package.json` — `@cloudflare/puppeteer` dependency + wrangler dev
  scripts.
