import WebSocket from "ws";

const url = process.env.WS_URL || "ws://127.0.0.1:8787/ws";
const room = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

function onceOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

function waitFor(ws, pred) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for room state")), 4000);
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "state" && pred(msg.state)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg.state);
      }
    };
    ws.on("message", onMsg);
  });
}

const phone = new WebSocket(url);
const tv = new WebSocket(url);
await onceOpen(phone);
await onceOpen(tv);

const ready = waitFor(tv, (state) => state.phones >= 1 && state.tvs >= 1);
phone.send(JSON.stringify({ type: "join", room, role: "phone" }));
tv.send(JSON.stringify({ type: "join", room, role: "tv" }));
await ready;

const updated = waitFor(tv, (state) => state.caption?.sourceText === "Let us pray.");
phone.send(
  JSON.stringify({
    type: "caption",
    caption: {
      id: "1",
      sourceLang: "en",
      interim: false,
      sourceText: "Let us pray.",
      textByLang: { en: "Let us pray.", es: "Oremos.", pt: "Oremos." },
      at: Date.now(),
    },
  }),
);

const after = await updated;
if (after.caption.textByLang.es !== "Oremos.") {
  console.error("unexpected caption", after.caption);
  process.exit(1);
}

phone.close();
tv.close();
console.log("room sync ok");
