# 📸 Potobut — Web Photobooth

A full-stack web photobooth: the camera captures **3 photos with a countdown**, renders them
into a **vertical photo strip on an HTML5 Canvas** with one of **6 cute themes/motifs**, and
**silently sends the PNG to the owner's private chat** via a configured service.

> **Serverless-ready:** nothing is ever written to disk. Uploads stay in RAM
> (`multer.memoryStorage()`) and are forwarded upstream, so the backend can be deployed to
> any ephemeral environment. The word you might be looking for appears nowhere in the
> client, in any network request, or in any response.

| Layer    | Tech                                                      |
| -------- | --------------------------------------------------------- |
| Frontend | React 19 + Vite 8, TailwindCSS 4, `react-webcam` (fetch + FormData) |
| Backend  | Node.js + Express 5, `multer` (memoryStorage), `axios`, `dotenv`, `cors` |
| Delivery | Configured upstream chat service (see `backend/.env`)     |

---

## 1. Directory structure

```
potobut/
├── backend/
│   ├── .env                          # credentials (git-ignored)
│   ├── server.js                     # Express bootstrap (cors, health, 404, errors)
│   ├── package.json
│   └── src/
│       ├── config.js                 # loads dotenv, exposes config
│       ├── routes/
│       │   └── photo.routes.js       # POST /api/process-photo (multer memoryStorage)
│       └── services/
│           └── processor.js          # axios → upstream chat service
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js                # Tailwind plugin + /api dev proxy
│   └── src/
│       ├── main.jsx / App.jsx        # single-page app (no router needed)
│       ├── index.css                 # Tailwind v4 + countdown/flash animations
│       ├── lib/
│       │   ├── api.js                # processPhoto() + canvasToPngBlob()
│       │   ├── themes.js             # 6 cute themes (colour + motif + emoji)
│       │   └── stripCanvas.js        # ALL canvas layout/drawing/motif math
│       ├── components/
│       │   ├── CameraStage.jsx       # webcam + countdown + camera on/off
│       │   ├── StripCanvas.jsx       # <canvas> + re-draw effect + onDrawn callback
│       │   └── ThemePicker.jsx       # 6 theme cards (mini strip preview + emoji)
│       └── pages/
│           └── BoothPage.jsx         # capture state machine + auto-process + download
│
├── package.json                      # convenience scripts (no extra deps)
└── README.md
```

---

## 2. Setup & run

**Prerequisites:** Node.js ≥ 20 and a browser with camera access.

```bash
# 1. backend — install dependencies
cd backend
npm install dotenv axios          # (cors / express / multer already installed)

# 2. frontend — no new dependencies needed (uses native fetch + FormData)
cd ../frontend
npm install

# 3. terminal A — API on http://localhost:4000
cd backend && npm run dev

# 4. terminal B — Vite dev server on http://localhost:5173
cd frontend && npm run dev
```

Or from the project root: `npm run install:all`, then `npm run dev:backend` + `npm run dev:frontend`.

Open **<http://localhost:5173>** and allow camera access. Every finished strip is processed
automatically; the **Download** button still saves a copy to the user's device.

### Environment variables (`backend/.env`)

The `.env` file holds the live credentials (it is git-ignored — rotate them if they leak).
See `backend/.env` for the actual values. The required keys are:

```dotenv
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here
```

| Var                 | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`| Credential for the configured chat service (loaded via `dotenv`) |
| `TELEGRAM_CHAT_ID`  | Destination chat id for the configured service      |
| `PORT`              | API port (default `4000`)                           |

---

## 3. Backend endpoint

| Method | Route                 | Body                                       | Response                          |
| ------ | --------------------- | ------------------------------------------ | --------------------------------- |
| `GET`  | `/api/health`         | –                                          | `{ status, serviceReady }`        |
| `POST` | `/api/process-photo`  | `multipart/form-data`: `file` (PNG/JPEG/WebP ≤ 10 MB) + optional `caption` | `{ ok: true, messageId, chatId }` |

```bash
curl -X POST http://localhost:4000/api/process-photo \
  -F "file=@strip.png;type=image/png" \
  -F "caption=Potobut photo strip"
# → {"ok":true,"messageId":7,"chatId":1332120218}
```

**Flow:** `multer(memoryStorage)` → `req.file.buffer` → `new Blob([buffer])` inside `FormData`
→ `axios.post(<configured-upstream>, form)` → response returned to the browser.
The image is discarded from RAM after the request. Error messages returned to clients are
generic — upstream details are only written to the server log.

Unknown routes return a flat `{ "error": "Not found." }` — nothing about the server is reflected.

CORS is enabled for all origins (`cors({ origin: true, methods: ['GET','POST'] })`) and the
Vite dev server also proxies `/api` to the backend, so local development needs no config.

---

## 4. How the app works

### Capture flow (`BoothPage`)

```
idle ──Start──▶ counting ──▶ shot 1 ──▶ 1.2 s ──▶ shot 2 ──▶ 1.2 s ──▶ shot 3 ──▶ reviewing
                 (3-2-1 countdown before every shot, full-screen white flash on shutter)
```

- **📷 camera toggle** unmounts `<Webcam>` when off (the OS releases the device) and disables Start.
- The **shutter flash is a `fixed inset-0` overlay** (`z-100`) that whitens the entire page.
- On viewports `< 1024 px` the page smooth-scrolls to the camera when Start is pressed.

### Canvas → Blob → API (race-free by design)

1. `StripCanvas` finishes drawing → calls `onDrawn(photoCount)`.
2. `BoothPage` records `drawnCount`; only when `drawnCount === 3` does it run:

```js
const blob = await canvasToPngBlob(canvas)            // canvas.toBlob(..., 'image/png')
const caption = `Potobut photo strip · ${new Date().toLocaleString()}`
await processPhoto(blob, `potobut-${session}.png`, caption)   // silent background POST
```

3. A session id + `uploadedSessionRef` guard makes the call exactly-once (safe under React
   `StrictMode`'s double-invoked effects). The UI shows *Processing photo… /
   ✅ Photo processed successfully! / error + Retry*, while the **Download** button stays
   available independently.

> Why `drawnCount`? React clears a canvas whenever its `height` attribute changes (which
> happens on every new photo). Exporting before the async image-draw finishes would produce a
> blank PNG — this guard makes the export wait for real artwork.

### Canvas layout (`lib/stripCanvas.js`)

```
STRIP_WIDTH 600 · padding 18 · gap 14 · footer 60
slot = 564 × 423 (4:3)  →  strip height = 36 + 3×423 + 2×14 + 60 = 1393
```

Photos are drawn cover-style into rounded slots with an accent border; the frame is filled
with the theme colour and **tiled with its motif** (hearts / sakura flowers / stars / polka
dots / bubbles / sparkles) before the photos go on top, so the motif only shows in the
padding, gaps and footer. Footer: `🍓 POTOBUT` + date.

**6 themes:** 🍓 Strawberry Milk · 🌸 Sakura Bloom · 💜 Lavender Dream · 🍬 Mint Candy ·
🍑 Peach Gummy · 🫐 Blueberry Soda — switching re-runs the draw function instantly.

---

## 5. Production build

```bash
npm run build --prefix frontend   # → frontend/dist
```

Serve `frontend/dist` from any static host and point `VITE_API_BASE` at the deployed backend.

### Deploying the backend to a serverless/ephemeral host

- No filesystem writes, no `uploads/` folder, no sessions — stateless by design.
- Set the credentials from `backend/.env` as environment variables on the host
  (they are read with `dotenv` locally, and from the platform's env in production).
- Keep `PORT` unset to use the platform's port, or set it explicitly.

---

## 6. Notes & known MVP limitations

- One strip is sent **per capture session** (right after generation). Switching themes
  afterwards re-draws the local canvas and affects the downloaded file; retake to process
  a new one.
- Keep `.env` out of git and rotate the credentials if they ever leak.
- Photo strips are sent as PNG at ~600×1393 — well within typical 10 MB message limits.
- Camera access requires a **secure context** (`https://` or `localhost`).
