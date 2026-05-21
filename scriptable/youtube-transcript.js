// youtube-transcript.js — Scriptable script for iOS.
//
// Runs entirely on-device. Loads the YouTube watch page inside a
// hidden Scriptable WebView (real Safari WebKit on your residential
// IP), lets YouTube's own JS execute, which solves the Proof-of-Origin
// Token natively, then fetches the captions URL from inside that
// page context and parses the result.
//
// No Cloudflare worker, no external API, no token. Just the phone.
//
// Why this works when the earlier raw-fetch and headless-Chrome
// approaches failed: YouTube's anti-scraping gates on (1) the IP not
// being a datacenter and (2) the request running inside a real
// browser session that has executed YouTube's PoT JS. Scriptable's
// WebView is WebKit running on your residential cellular/wifi IP,
// which checks both boxes.
//
// Input: a YouTube URL, supplied via any of:
//   - iOS Share Sheet (Run Script in Scriptable share extension)
//   - Shortcuts "Run Script" action with text input
//   - Manual prompt when run from inside the Scriptable app
//
// Output: header (Title / Channel / URL / Language / Length) followed
// by the transcript, copied to clipboard and emitted as Shortcut
// output so a downstream Shortcut action can do whatever next
// (Copy to Clipboard fallback, Send to ChatGPT, etc.).

const PREFERRED_LANG = "en";

// ----------- helpers -----------

function extractVideoId(url) {
    if (typeof url !== "string") return null;
    let m = url.match(/youtu\.be\/([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/[?&]v=([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/\/shorts\/([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/\/embed\/([\w-]{11})/);
    if (m) return m[1];
    return null;
}

async function getUrl() {
    if (args.urls && args.urls.length) return args.urls[0];
    if (args.plainTexts && args.plainTexts.length) {
        const t = args.plainTexts[0];
        if (t && /youtu/.test(t)) return t;
    }
    if (args.shortcutParameter) {
        if (typeof args.shortcutParameter === "string") return args.shortcutParameter;
        if (args.shortcutParameter.absoluteString) return args.shortcutParameter.absoluteString;
        if (args.shortcutParameter.url) return args.shortcutParameter.url;
    }
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

function eventsToText(events) {
    const lines = [];
    let last = "";
    for (const ev of events) {
        if (!ev.segs) continue;
        const line = ev.segs.map(s => s.utf8 || "").join("").trim();
        if (!line) continue;
        if (line === last) continue;
        lines.push(line);
        last = line;
    }
    return lines.join("\n");
}

async function fetchTranscriptViaWebView(videoId) {
    const wv = new WebView();
    await wv.loadURL(`https://www.youtube.com/watch?v=${videoId}`);
    // Async eval. Single IIFE wrapped in JSON.stringify because
    // evaluateJavaScript's return must be a JSON-serializable scalar.
    const js = `(async () => {
        for (let i = 0; i < 60; i++) {
            const pr = window.ytInitialPlayerResponse;
            if (pr && pr.videoDetails && pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks && pr.captions.playerCaptionsTracklistRenderer.captionTracks.length) break;
            await new Promise(r => setTimeout(r, 200));
        }
        const pr = window.ytInitialPlayerResponse || {};
        const tracks = (pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
        if (!tracks.length) return JSON.stringify({ ok: false, error: "No captions on this video" });
        const preferred = ${JSON.stringify(PREFERRED_LANG)};
        let track = tracks.find(t => t.languageCode === preferred && t.kind !== "asr")
                 || tracks.find(t => t.languageCode && t.languageCode.startsWith(preferred) && t.kind !== "asr")
                 || tracks.find(t => t.languageCode && t.languageCode.startsWith(preferred))
                 || tracks.find(t => t.kind !== "asr")
                 || tracks[0];
        try {
            const r = await fetch(track.baseUrl + "&fmt=json3");
            if (!r.ok) return JSON.stringify({ ok: false, error: "transcript fetch returned HTTP " + r.status });
            const text = await r.text();
            if (!text) return JSON.stringify({ ok: false, error: "transcript fetch returned empty body" });
            const j = JSON.parse(text);
            return JSON.stringify({
                ok: true,
                title: (pr.videoDetails && pr.videoDetails.title) || "",
                channel: (pr.videoDetails && pr.videoDetails.author) || "",
                language: track.languageCode || preferred,
                isAuto: track.kind === "asr",
                events: j.events || [],
            });
        } catch (e) {
            return JSON.stringify({ ok: false, error: String((e && e.message) || e) });
        }
    })()`;
    const raw = await wv.evaluateJavaScript(js, true);
    if (!raw) throw new Error("WebView returned empty result");
    const parsed = JSON.parse(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
}

// ----------- entry -----------

try {
    const url = await getUrl();
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Couldn't extract video ID from: " + url);

    const data = await fetchTranscriptViaWebView(videoId);
    const transcript = eventsToText(data.events);
    if (!transcript) throw new Error("Transcript fetched but produced no text");

    const lang = data.language + (data.isAuto ? " (auto)" : "");
    const header = `Title: ${data.title}
Channel: ${data.channel}
URL: https://www.youtube.com/watch?v=${videoId}
Language: ${lang}
Length: ${transcript.length} chars
`;
    const out = header + "\n" + transcript;

    // Try to copy to clipboard. When run from a Shortcut "Run Script"
    // action, iOS sometimes denies Scriptable pasteboard access; ignore
    // that error and rely on a "Copy to Clipboard" Shortcut step that
    // picks up Script.setShortcutOutput(out) below.
    try { Pasteboard.copy(out); } catch (e) { /* sandboxed, no-op */ }
    Script.setShortcutOutput(out);

    if (config.runsInApp) {
        const a = new Alert();
        a.title = "Transcript copied";
        a.message = `${data.title}\n\n${transcript.length} chars · ${lang}`;
        a.addAction("OK");
        await a.presentAlert();
    }
} catch (e) {
    console.error(e.message);
    Script.setShortcutOutput("failed: " + e.message);
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
