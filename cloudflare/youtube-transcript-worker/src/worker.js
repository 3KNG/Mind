/**
 * youtube-transcript-worker
 *
 * HTTP-only Cloudflare Worker that returns the transcript for a YouTube
 * video. Drives a headless Chromium via Cloudflare Browser Rendering
 * (the [[browser]] binding) because YouTube's `timedtext` endpoint now
 * requires a JS-computed Proof-of-Origin Token that pure-JS clients
 * (Scriptable, plain fetch) can't generate. Real Chrome solves the PoT
 * natively, so we let Chrome do the captioned fetch from inside the
 * YouTube page context and just relay the resulting JSON.
 *
 * Request:
 *   POST /extract
 *   Authorization: Bearer <INGEST_TOKEN>
 *   Content-Type: application/json
 *   Body: { "url": "<youtube-url>", "lang"?: "en", "preferManual"?: true }
 *
 * Response 200 application/json:
 *   { ok: true, videoId, title, channel, language, isAutoCaption,
 *     charCount, transcript }
 * Error:
 *   { ok: false, error: "<message>" } with 400/401/502.
 *
 * Required secret (set via `wrangler secret put`):
 *   INGEST_TOKEN   random string, shared with the Scriptable client.
 *
 * Required binding (in wrangler.toml):
 *   [[browser]] binding = "BROWSER"
 *
 * Free-tier quota: 10 minutes of browser time per day on Workers Free,
 * 10 hours per month on Workers Paid. Each transcript call is ~8-12s
 * of browser time.
 */

import puppeteer from '@cloudflare/puppeteer';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 25000;

/* Extract a YouTube video ID from any common URL form. Returns null if
 * the URL doesn't match a known pattern. */
function extractVideoId(url) {
    if (typeof url !== 'string') return null;
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

/* Pick the best caption track for the requested language preference.
 * Mirrors the Scriptable script's old in-app logic:
 *   1. preferred lang, manual (kind !== 'asr')
 *   2. preferred lang, any kind
 *   3. any manual track
 *   4. first available track
 */
function pickTrack(tracks, preferredLang, preferManual) {
    if (!tracks?.length) return null;
    if (preferManual) {
        const exact = tracks.find(t => t.languageCode === preferredLang && t.kind !== 'asr');
        if (exact) return exact;
        const prefix = tracks.find(t => t.languageCode?.startsWith(preferredLang) && t.kind !== 'asr');
        if (prefix) return prefix;
    }
    const prefAny = tracks.find(t => t.languageCode?.startsWith(preferredLang));
    if (prefAny) return prefAny;
    const anyManual = tracks.find(t => t.kind !== 'asr');
    if (anyManual) return anyManual;
    return tracks[0];
}

/* Convert YouTube's json3 timedtext events to plain text. Joins each
 * event's utf8 segs, trims, drops blanks, dedupes consecutive lines
 * (auto-captions repeat heavily). */
function eventsToText(events) {
    const lines = [];
    let last = '';
    for (const ev of events) {
        if (!ev.segs) continue;
        const line = ev.segs.map(s => s.utf8 || '').join('').trim();
        if (!line) continue;
        if (line === last) continue;
        lines.push(line);
        last = line;
    }
    return lines.join('\n');
}

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/* The real work. Launches Chromium, loads the YouTube watch page, reads
 * window.ytInitialPlayerResponse to find caption tracks, picks one,
 * then fetches the timedtext URL FROM INSIDE THE PAGE CONTEXT. Doing the
 * fetch from the page lets it inherit the YouTube session cookies and
 * the JS-computed PoT that ships with the page, which is the whole
 * reason this Worker exists. */
async function extractTranscript(env, { url, lang, preferManual }) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error(`Couldn't extract video ID from: ${url}`);

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const browser = await puppeteer.launch(env.BROWSER);
    try {
        const page = await browser.newPage();
        await page.setUserAgent(UA);
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(
            () => !!window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length,
            { timeout: 15000 }
        );

        const info = await page.evaluate(() => {
            const pr = window.ytInitialPlayerResponse || {};
            const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
            return {
                tracks,
                title: pr.videoDetails?.title || '',
                channel: pr.videoDetails?.author || '',
            };
        });

        const track = pickTrack(info.tracks, lang || 'en', preferManual !== false);
        if (!track) throw new Error('No captions available on this video.');

        const events = await page.evaluate(async (baseUrl) => {
            const r = await fetch(baseUrl + '&fmt=json3');
            if (!r.ok) throw new Error('fetch ' + r.status);
            const j = await r.json();
            return j.events || [];
        }, track.baseUrl);

        const transcript = eventsToText(events);
        return {
            ok: true,
            videoId,
            title: info.title,
            channel: info.channel,
            language: track.languageCode || (lang || 'en'),
            isAutoCaption: track.kind === 'asr',
            charCount: transcript.length,
            transcript,
        };
    } finally {
        // Browser time costs money; always close even on throw.
        try { await browser.close(); } catch (_) { /* ignore */ }
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Health probe / unknown path.
        if (url.pathname !== '/extract') {
            return new Response('youtube-transcript-worker', { status: 200 });
        }

        if (request.method !== 'POST') {
            return jsonResponse(405, { ok: false, error: 'POST only' });
        }

        const auth = request.headers.get('Authorization') || '';
        if (!env.INGEST_TOKEN || auth !== `Bearer ${env.INGEST_TOKEN}`) {
            return jsonResponse(401, { ok: false, error: 'unauthorized' });
        }

        const ct = (request.headers.get('Content-Type') || '').toLowerCase();
        if (!ct.includes('application/json')) {
            return jsonResponse(400, { ok: false, error: 'Content-Type must be application/json' });
        }

        let body;
        try { body = await request.json(); }
        catch (_) { return jsonResponse(400, { ok: false, error: 'bad json' }); }

        if (!body || typeof body.url !== 'string' || !body.url.trim()) {
            return jsonResponse(400, { ok: false, error: 'missing url' });
        }

        // Enforce a per-request budget so a stuck page can't burn all our
        // browser minutes. Race extractTranscript against a timeout.
        const work = extractTranscript(env, {
            url: body.url.trim(),
            lang: typeof body.lang === 'string' ? body.lang : 'en',
            preferManual: body.preferManual !== false,
        });
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS)
        );

        try {
            const result = await Promise.race([work, timeout]);
            return jsonResponse(200, result);
        } catch (e) {
            const msg = (e && e.message) ? e.message : String(e);
            // Treat "no captions" + URL-parse errors as 400 (client problem),
            // everything else as 502 (upstream/browser problem).
            const status = /video ID|No captions|missing url/i.test(msg) ? 400 : 502;
            return jsonResponse(status, { ok: false, error: msg });
        }
    },
};
