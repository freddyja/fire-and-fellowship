import "dotenv/config";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { LANGS, isLang, type ClientMessage, type Lang } from "../src/shared/types.ts";
import { joinRoom, leaveSocket, setCaption, setControl, setLayout } from "./rooms.ts";
import { resolveProvider, translateLine } from "./translate.ts";

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 8787);
const root = dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});

app.get("/api/health", (_req, res) => {
  const health = resolveProvider();
  res.json({
    ok: true,
    provider: health.provider,
    keyed: health.keyed,
    warning: health.warning,
  });
});

app.post("/api/translate", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const source = req.body?.source;
  const targets = Array.isArray(req.body?.targets) ? req.body.targets : [];
  if (!text) {
    res.status(400).json({ error: "Missing text to translate." });
    return;
  }
  if (!isLang(String(source))) {
    res.status(400).json({ error: "Source language must be en, es, or pt." });
    return;
  }
  const langs = targets.filter((item: unknown): item is Lang => typeof item === "string" && isLang(item));
  try {
    const result = await translateLine(text, source, langs.length ? langs : [...LANGS]);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Translation failed.",
    });
  }
});

app.get("/handout", (_req, res) => {
  res.redirect("/handout.html");
});

if (isProd) {
  const dist = resolve(root, "../dist");
  app.use(express.static(dist));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Bad message from the phone." }));
      return;
    }

    if (msg.type === "join") {
      const room = String(msg.room || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (room.length < 3 || room.length > 8) {
        ws.send(JSON.stringify({ type: "error", message: "Room codes are 3–8 letters or numbers." }));
        return;
      }
      const role = msg.role === "tv" ? "tv" : "phone";
      joinRoom(ws, room, role);
      return;
    }
    if (msg.type === "layout") {
      setLayout(ws, msg.layout);
      return;
    }
    if (msg.type === "caption") {
      setCaption(ws, msg.caption);
      return;
    }
    if (msg.type === "control") {
      setControl(ws, Boolean(msg.listening), isLang(msg.sourceLang) ? msg.sourceLang : "en");
    }
  });

  ws.on("close", () => leaveSocket(ws));
  ws.on("error", () => leaveSocket(ws));
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === 1) client.ping();
  }
}, 25000);

httpServer.listen(port, "0.0.0.0", () => {
  const health = resolveProvider();
  console.log(
    `[captions] ${isProd ? "production" : "api+ws"} on :${port}  translator=${health.provider}${health.keyed ? " (keyed)" : ""}`,
  );
  if (!isProd) {
    console.log("[captions] Open the UI at http://localhost:5173 (Vite). Phone and TV join the same room code.");
  } else {
    console.log(`[captions] Open http://localhost:${port}  Handout: /handout.html  Live: /live/`);
  }
});

process.on("SIGINT", () => {
  clearInterval(heartbeat);
  httpServer.close(() => process.exit(0));
});
