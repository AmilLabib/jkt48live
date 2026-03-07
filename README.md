# JKT48 Showroom Monitor

A single-page dashboard that watches the official [SHOWROOM](https://www.showroom-live.com/) campaign feed, tracks verified JKT48 channels on [IDN Live](https://www.idn.app/), and lets you open a dedicated room view with the video player plus live comments.

The app is built with **React 19**, **Vite**, and **TypeScript**. Live data is fetched through `https://r.jina.ai` which mirrors the public SHOWROOM API/HTML responses and exposes permissive CORS headers so the browser can read them without a custom backend.

All IDN Live usernames live in `src/data/idnChannels.ts`, a generated list based on the handles provided by the committee. You can refresh the file anytime via `node scripts/update-idn-channels.mjs`. Some handles such as `@jkt48_kaela` are not present on IDN, so they will be skipped until the official account exists.

## Features

- 🔍 Fetches the JKT48 roster directly from the campaign page and keeps it cached.
- 📡 Polls `/api/live/onlives` every 60 seconds and combines the feed with all monitored IDN Live channels.
- 🎬 Dedicated room page with an HLS player powered by `hls.js`, so streams work in every modern browser.
- 💬 Live comment log with a 5-second auto-refresh cadence, rendered with avatars, timestamps, and class levels.
- 📺 Bonus IDN Live room page so you can stay inside the dashboard while watching non-SHOWROOM broadcasts.
- 🌑 Custom dark UI that highlights each card, viewer counts, and provides quick links back to the official room/profile.

## Development

```powershell
# install dependencies
npm install

# start dev server
npm run dev

# build for production
npm run build
```

The Vite dev server will print a local URL (default `http://localhost:5173`).

## Data sources & caveats

- `https://r.jina.ai/https://www.showroom-live.com/campaign/akb48_sr_eng_ind` — used to extract the JKT48 roster (room ids, images, bios).
- `https://r.jina.ai/https://www.showroom-live.com/api/live/onlives` — flattened to determine who is live and grab streaming URLs.
- `https://r.jina.ai/https://www.showroom-live.com/api/live/comment_log?room_id=XXXX` — polled inside the room page for comment updates.
- `https://api.idn.app/graphql` (proxied through the Vite dev server) — queried with aliases for every configured JKT48 channel to detect who is live on IDN.

Because the project talks directly to the public API through a proxy, browser sessions depend on that proxy remaining available. If SHOWROOM introduces additional anti-bot checks you may need to replace the proxy with a custom backend.

### Offline mock data

Local smoke tests no longer rely on the upstream API: whenever a proxy call fails or returns HTML (which happens frequently when the proxy rate-limits), the app automatically falls back to the JSON fixtures under `public/mock/`:

- `mock/members.json` — parsed into `CampaignMember` entries.
- `mock/onlives.json` — flattened into the live-room grid so features such as the "room acak" button stay clickable even without real traffic.
- `mock/comments.json` — used by the room page for a handful of sample comments.
- `mock/idnLives.json` — mimics at least one IDN broadcast so the combined dashboard and IDN-specific page keep working offline.

You can edit these files to match any scenario you want to demo; Vite will hot-reload them instantly.
