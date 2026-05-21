// youtube-transcript.js — Scriptable script for iOS.
//
// Thin HTTP client. POSTs a YouTube URL to the youtube-transcript-worker
// Cloudflare Worker, which drives a headless Chrome to read the page and
// fetch the captions with a valid Proof-of-Origin Token. The Worker
// returns the parsed transcript + metadata; this script formats the
// output, copies it to the clipboard, and hands it back to Shortcuts.
//
// Worker source: cloudflare/youtube-transcript-worker/.
//
// Input: a YouTube URL, supplied via any of:
//   - iOS Share Sheet (Run Script in Scriptable share extension)
//   - Shortcuts "Run Script" action with text input
//   - Manual prompt when run from inside the Scriptable app
//
// Output: header (Title / Channel / URL / Language / Length) followed by
// the transcript, copied to clipboard and emitted as Shortcut output.

// ----------- CONFIG -----------
// Replace WORKER_URL with the URL wrangler prints after `wrangler deploy`.
// Replace INGEST_TOKEN with the value set via `wrangler secret put INGEST_TOKEN`.
const WORKER_URL = "https://youtube-transcript-worker.chris-guadarrama.workers.dev/extract";
const INGEST_TOKEN = "PASTE_INGEST_TOKEN_HERE";
const PREFERRED_LANG = "en";

// ----------- helpers -----------

async function getUrl() {
    // Share Sheet: URLs
    if (args.urls && args.urls.length) return args.urls[0];
    // Share Sheet: plain text containing a URL
    if (args.plainTexts && args.plainTexts.length) {
        const t = args.plainTexts[0];
        if (t && /youtu/.test(t)) return t;
    }
    // Shortcuts "Run Script" parameter
    if (args.shortcutParameter) {
        if (typeof args.shortcutParameter === "string") return args.shortcutParameter;
        if (args.shortcutParameter.absoluteString) return args.shortcutParameter.absoluteString;
        if (args.shortcutParameter.url) return args.shortcutParameter.url;
    }
    // Manual: prompt user
    const alert = new Alert();
    alert.title = "YouTube URL";
    alert.message = "Paste a YouTube link.";
    alert.addTextField("https://www.youtube.com/watch?v=...");
    alert.addAction("Get Transcript");
    alert.addCancelAction("Cancel");
    const i = await alert.presentAlert();
    if (i === -1) throw new Error("Cancelled");
    return alert.textFieldValue(0);
}

async function callWorker(url) {
    const req = new Request(WORKER_URL);
    req.method = "POST";
    req.headers = {
        "Authorization": `Bearer ${INGEST_TOKEN}`,
        "Content-Type": "application/json",
    };
    req.body = JSON.stringify({
        url,
        lang: PREFERRED_LANG,
        preferManual: true,
    });
    // Browser Rendering needs ~10s; give the request enough headroom.
    req.timeoutInterval = 60;
    const body = await req.loadJSON();
    const code = req.response?.statusCode || 0;
    if (code !== 200 || !body || body.ok !== true) {
        const msg = (body && body.error) ? body.error : `HTTP ${code}`;
        throw new Error(msg);
    }
    return body;
}

// ----------- entry -----------

try {
    if (INGEST_TOKEN === "PASTE_INGEST_TOKEN_HERE") {
        throw new Error("INGEST_TOKEN not configured. Edit the script and paste the Worker token.");
    }

    const inputUrl = await getUrl();
    const res = await callWorker(inputUrl);

    const langTag = res.language + (res.isAutoCaption ? " (auto)" : "");
    const header = `Title: ${res.title || "(unknown title)"}
Channel: ${res.channel || ""}
URL: https://www.youtube.com/watch?v=${res.videoId}
Language: ${langTag}
Length: ${res.charCount} chars
`;
    const out = header + "\n" + (res.transcript || "");

    // Try to copy to clipboard. When run from a Shortcut "Run Script" action,
    // iOS sometimes denies Scriptable pasteboard access; ignore that error
    // (add a "Copy to Clipboard" Shortcut step after Run Script as backup).
    try { Pasteboard.copy(out); } catch (e) { /* sandboxed, no-op */ }
    Script.setShortcutOutput(out);

    if (config.runsInApp) {
        const a = new Alert();
        a.title = "Transcript copied";
        a.message = `${res.title || res.videoId}\n\n${res.charCount} chars · ${langTag}`;
        a.addAction("OK");
        await a.presentAlert();
    }
} catch (e) {
    console.error(e.message);
    Script.setShortcutOutput(`failed: ${e.message}`);
    if (config.runsInApp) {
        const a = new Alert();
        a.title = "Transcript failed";
        a.message = e.message;
        a.addAction("OK");
        await a.presentAlert();
    } else {
        const n = new Notification();
        n.title = "Transcript failed";
        n.body = e.message;
        await n.schedule();
    }
}

Script.complete();
