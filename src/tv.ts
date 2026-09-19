import "./styles.css";
import { connectRoom } from "./shared/roomClient";
import { normalizeRoomCode } from "./shared/roomCode";
import { LANG_META, type Lang, type RoomState } from "./shared/types";

const params = new URLSearchParams(location.search);
const room = normalizeRoomCode(params.get("room") || "");

const meta = document.querySelector("#meta")!;
const wait = document.querySelector("#wait")!;
const stage = document.querySelector("#stage")!;
const badge = document.querySelector("#badge")!;

function render(state: RoomState) {
  const langs = state.layout.languages;
  const cols = state.layout.mode === "single" ? 1 : Math.min(3, Math.max(1, langs.length));
  const shown = cols === 1 ? [langs[0]] : langs.slice(0, cols);
  meta.textContent = `Room ${state.room} · ${state.listening ? "Listening" : "Idle"} · ${state.phones} phone / ${state.tvs} TV`;

  if (state.translateWarning) badge.textContent = state.translateWarning;
  else badge.textContent = "";

  if (!state.caption) {
    wait.classList.remove("hidden");
    stage.classList.add("hidden");
    wait.textContent = state.phones
      ? "Waiting for captions in this room."
      : "Waiting for a phone to join this room.";
    return;
  }

  wait.classList.add("hidden");
  stage.classList.remove("hidden");
  stage.setAttribute("data-cols", String(shown.length));
  stage.innerHTML = "";
  for (const lang of shown) {
    const col = document.createElement("div");
    col.className = "tv-col";
    const label = document.createElement("div");
    label.className = "tv-lang";
    label.textContent = LANG_META[lang as Lang].short;
    const text = document.createElement("div");
    text.className = `tv-text${state.caption.interim ? " interim" : ""}`;
    text.textContent =
      state.caption.textByLang[lang as Lang] ||
      state.caption.sourceText ||
      "";
    col.append(label, text);
    stage.append(col);
  }
}

if (!room) {
  wait.textContent = "Add a room code to this TV link, or open Live Captions on the phone first.";
  meta.textContent = "No room";
} else {
  connectRoom({
    room,
    role: "tv",
    onState: render,
    onStatus(status) {
      if (status !== "open") meta.textContent = status === "connecting" ? "Connecting…" : "Reconnecting…";
    },
    onError(message) {
      badge.textContent = message;
    },
  });
}

void navigator.wakeLock?.request("screen").catch(() => undefined);
