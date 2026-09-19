# Fire and Fellowship

House Christian fellowship in Spring Hill / Brooksville, Florida. The site has two pieces:

1. **Handout** — the original single-page verse, discussion, and prayer wall (`/handout.html`).
2. **Live Captions** — phone captures speech; a TV browser in the **same room** shows large English / Spanish / Portuguese captions.

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**

| Path | What it is |
| --- | --- |
| `/` | Home: Handout vs Live Captions |
| `/handout.html` (also `/handout`) | Original verse / prayer page |
| `/live/` | Create or join a caption room |
| `/live/phone.html?room=ABCD` | Phone: mic, layout, languages |
| `/live/tv.html?room=ABCD` | TV: big captions, no mic |

Production-style (one port, UI + WebSocket together):

```bash
npm run build
npm start
```

Then open **http://localhost:8787** (or `PORT` from `.env`).

Copy `.env.example` to `.env` if you want to set a translate provider. **Never commit API keys.**

## Handout (original page)

The existing single-file meeting page still works. It is served unchanged in spirit at `/handout.html` (a Home / Live Captions link was added in the header). Open it with `npm run dev`, or open `public/handout.html` directly if you only need the handout and no captions.

It remains English / Spanish / Portuguese, with verse draw, discussion, prayer wall, and the rest of the original page. No captions server is required for that page alone.

## Live Captions

Freddy’s demo: one phone as mic + remote, one TV as the display, **same room code**. Captions and layout controls sync over a WebSocket. Screen-sharing the phone UI is only a fallback if a browser cannot join the session — the app itself does real same-session sync.

### Demo on two devices (same Wi‑Fi)

1. On a laptop run `npm run dev`.
2. In the Vite output, use the **Network** URL (LAN IP), not `localhost`, for the phone and TV — e.g. `http://192.168.1.20:5173`.
3. Phone (Chrome is best): open `/live/`, tap **Create a room**, then **Phone control**.
4. TV / computer on the HDMI: open the copied TV link, or `/live/tv.html?room=THECODE`.
5. On the phone, pick the spoken language, pick which of EN / ES / PT appear on the TV, choose one-language full screen or 2–3 columns.
6. Tap **Start microphone**, or **Send sample verse** / type a line if the mic is blocked.

Keep the phone close to the person speaking. A pocket or a far table will miss words.

If you are not on the same LAN, use a tunnel (ngrok, Cloudflare Tunnel, Tailscale) to the Vite port in dev, or to `PORT` after `npm start`. Both devices must use that public URL so they hit the same WebSocket server.

### Layouts

- **One language, full screen** — large type for across a living room.
- **Columns** — two or three of EN | ES | PT, driven by the phone’s language chips.

Any speech direction among English, Spanish, and Portuguese is supported: set **Spoken language** to what the mic should hear; the TV still shows the languages you selected.

### Speech-to-text (MVP)

The phone uses the **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`). There is no cloud STT key for the MVP. The code is isolated in `src/stt/webSpeech.ts` so a later Deepgram / Google / Whisper adapter can replace it.

Honest browser limits:

- **Chrome on Android or desktop** — this is the path that usually works, including interim (partial) captions.
- **Safari / iOS** — `webkitSpeechRecognition` exists on some versions but is unreliable (often stops, weak interim results, extra permission prompts). If it fails, the phone shows a plain error and you can type a line.
- Mic permission denied — the phone says so in plain language; typed lines still go to the TV.

### Translation (MVP)

Pluggable server translators in `server/translate.ts`. Keys live only in environment variables (see `.env.example`).

| `TRANSLATE_PROVIDER` | What happens |
| --- | --- |
| `local` | Offline-ish: `src/glossary/faith.json` phrases + faith terms (Lord, Spirit, Scripture names, …). |
| `mymemory` | Free public demo API, no key, rate-limited. Optional `MYMEMORY_EMAIL` (not a secret). |
| `deepl` | DeepL HTTP API if `DEEPL_API_KEY` is set. |
| `google` | Google Cloud Translation if `GOOGLE_TRANSLATE_API_KEY` is set. |
| `auto` (default) | DeepL if keyed, else Google if keyed, else MyMemory, else local glossary if the network call fails. |

Without a paid key, full sentences are best-effort. The glossary still keeps common fellowship words aligned. Failures are visible on the phone/TV instead of failing silently.

This is **not** a production deploy with paid translation. Do not paste real keys into the repo.

### Architecture

```
Phone (Web Speech or typed line)
  → POST /api/translate  (Node, keys stay on the server)
  → WebSocket /ws        (room: caption + layout + listening)
  → TV display
```

Local `npm run dev` runs two processes: Vite on **5173** (pages) and a small Node server on **8787** (translate + WebSocket). Vite proxies `/api` and `/ws`. After `npm start`, everything is on one port.

Vercel static hosting can serve the built pages, but **this WebSocket room is a long-lived Node process**. For a later host, run `npm start` on Fly, Railway, a home Pi, or swap the `/ws` layer for PartyKit. The phone/TV protocol in `src/shared/types.ts` is small on purpose.

Target feel is about 2–3 seconds from speech to TV. Interim captions are sent as soon as the browser provides them; translations catch up on the same line.

## Scripts

- `npm run dev` — Vite + caption server (what you want for a living-room demo)
- `npm run build` — typecheck + production web build into `dist/`
- `npm start` — serve `dist/` plus `/api` and `/ws`
