import "./styles.css";
import { fetchHealth, translateLine } from "./shared/api";
import { connectRoom } from "./shared/roomClient";
import { normalizeRoomCode, randomRoomCode } from "./shared/roomCode";
import { LANGS, LANG_META, type CaptionState, type Lang, type LayoutState } from "./shared/types";
import { createWebSpeechStt, speechRecognitionSupported } from "./stt/webSpeech";

const SAMPLE: Record<Lang, string> = {
  en: "As iron sharpens iron, so one man sharpens another.",
  es: "Como el hierro afila el hierro, así un hombre afila a otro.",
  pt: "Assim como o ferro afia o ferro, um homem afia a outro.",
};

const params = new URLSearchParams(location.search);
const room = normalizeRoomCode(params.get("room") || "") || randomRoomCode();
if (!params.get("room")) {
  history.replaceState(null, "", `/live/phone.html?room=${room}`);
}

const roomCodeEl = document.querySelector("#room-code")!;
const peersEl = document.querySelector("#peers")!;
const bannerEl = document.querySelector("#banner")!;
const previewEl = document.querySelector("#preview")!;
const micBtn = document.querySelector<HTMLButtonElement>("#mic")!;
const typed = document.querySelector<HTMLTextAreaElement>("#typed")!;
const tvNav = document.querySelector<HTMLAnchorElement>("#tv-nav")!;
const sourceBox = document.querySelector("#source-langs")!;
const tvLangBox = document.querySelector("#tv-langs")!;

roomCodeEl.textContent = room;
tvNav.href = `/live/tv.html?room=${room}`;

let sourceLang: Lang = "en";
let tvLangs: Lang[] = ["en", "es", "pt"];
let layoutMode: LayoutState["mode"] = "columns";
let seq = 0;
let activeId = "";
let listening = false;
let lastWarning = "";

const roomConn = connectRoom({
  room,
  role: "phone",
  onState(state) {
    const tvUrl = `${location.origin}/live/tv.html?room=${room}`;
    peersEl.textContent = `${state.phones} phone · ${state.tvs} TV · ${tvUrl}`;
    if (state.translateWarning) lastWarning = state.translateWarning;
  },
  onStatus(status) {
    if (status === "connecting") setBanner("info", "Connecting to the caption room…");
    if (status === "open") refreshBanner();
    if (status === "closed") setBanner("warn", "Lost the room connection. Reconnecting…");
  },
  onError(message) {
    setBanner("warn", message);
  },
});

function currentLayout(): LayoutState {
  const languages = tvLangs.length ? tvLangs : [sourceLang];
  return {
    mode: languages.length === 1 ? "single" : layoutMode,
    languages,
  };
}

function pushLayout() {
  roomConn.send({ type: "layout", layout: currentLayout() });
}

function pushControl() {
  roomConn.send({ type: "control", listening, sourceLang });
}

function setBanner(kind: "info" | "warn" | "ok", text: string) {
  bannerEl.className = `status ${kind}`;
  bannerEl.textContent = text;
}

function refreshBanner() {
  const bits: string[] = [];
  if (!speechRecognitionSupported()) {
    bits.push("This browser cannot turn speech into text. Chrome on the phone is best. You can still type a line.");
  }
  if (lastWarning) bits.push(lastWarning);
  if (!bits.length) {
    setBanner("ok", "Same-session sync is on. Start the mic, or send a line, and the TV will follow.");
    return;
  }
  setBanner("warn", bits.join(" "));
}

function renderLangButtons() {
  sourceBox.innerHTML = "";
  for (const lang of LANGS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-btn";
    btn.textContent = `${LANG_META[lang].short} · ${LANG_META[lang].label}`;
    btn.setAttribute("aria-pressed", String(lang === sourceLang));
    btn.addEventListener("click", () => {
      sourceLang = lang;
      stt.setLang(lang);
      pushControl();
      renderLangButtons();
    });
    sourceBox.appendChild(btn);
  }

  tvLangBox.innerHTML = "";
  for (const lang of LANGS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = LANG_META[lang].short;
    btn.setAttribute("aria-pressed", String(tvLangs.includes(lang)));
    btn.addEventListener("click", () => {
      if (tvLangs.includes(lang)) {
        if (tvLangs.length === 1) return;
        tvLangs = tvLangs.filter((item) => item !== lang);
      } else {
        tvLangs = [...tvLangs, lang];
      }
      pushLayout();
      renderLangButtons();
    });
    tvLangBox.appendChild(btn);
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach((btn) => {
  btn.addEventListener("click", () => {
    layoutMode = btn.dataset.layout === "single" ? "single" : "columns";
    document.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach((other) => {
      other.setAttribute("aria-pressed", String(other === btn));
    });
    pushLayout();
  });
});

async function publish(text: string, interim: boolean) {
  const trimmed = text.trim();
  if (!trimmed) return;
  seq += 1;
  const id = interim ? `live-${seq}` : `final-${seq}`;
  if (!interim) activeId = id;
  const caption: CaptionState = {
    id,
    sourceLang,
    interim,
    sourceText: trimmed,
    textByLang: { [sourceLang]: trimmed },
    at: Date.now(),
  };
  previewEl.classList.toggle("muted", false);
  previewEl.textContent = trimmed + (interim ? " …" : "");
  roomConn.send({ type: "caption", caption });

  const targets = currentLayout().languages;
  const requestId = seq;
  try {
    const result = await translateLine(trimmed, sourceLang, targets);
    if (requestId !== seq && interim) return;
    if (result.warning) lastWarning = result.warning;
    caption.textByLang = { ...caption.textByLang, ...result.translations };
    roomConn.send({ type: "caption", caption });
    refreshBanner();
  } catch {
    lastWarning = "Could not reach the translator. The TV still has the spoken language.";
    refreshBanner();
  }
}

let debounce: number | undefined;
const stt = createWebSpeechStt(sourceLang, {
  onPartial(text) {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      void publish(text, true);
    }, 280);
  },
  onFinal(text) {
    window.clearTimeout(debounce);
    void publish(text, false);
  },
  onError(message) {
    setBanner("warn", message);
    listening = false;
    micBtn.dataset.on = "false";
    micBtn.textContent = "Start microphone";
    pushControl();
  },
  onStart() {
    listening = true;
    micBtn.dataset.on = "true";
    micBtn.textContent = "Stop microphone";
    pushControl();
  },
  onStop() {
    listening = false;
    micBtn.dataset.on = "false";
    micBtn.textContent = "Start microphone";
    pushControl();
  },
});

micBtn.addEventListener("click", () => {
  if (listening) stt.stop();
  else stt.start();
});

document.querySelector("#send-typed")!.addEventListener("click", () => {
  void publish(typed.value, false);
  typed.value = "";
});

document.querySelector("#send-sample")!.addEventListener("click", () => {
  void publish(SAMPLE[sourceLang], false);
});

document.querySelector("#copy-code")!.addEventListener("click", async () => {
  await navigator.clipboard.writeText(room);
});

document.querySelector("#copy-tv")!.addEventListener("click", async () => {
  await navigator.clipboard.writeText(`${location.origin}/live/tv.html?room=${room}`);
});

renderLangButtons();
pushLayout();
pushControl();

void fetchHealth()
  .then((health) => {
    if (health.warning) lastWarning = health.warning;
    else if (health.provider === "mymemory") {
      lastWarning =
        "Translations use the free MyMemory demo when the network allows; otherwise the local fellowship glossary.";
    } else if (health.provider === "local") {
      lastWarning = "No translate API key is set. Other languages use the built-in fellowship glossary.";
    }
    refreshBanner();
  })
  .catch(() => {
    setBanner("warn", "The caption server is not reachable. Is `npm run dev` running?");
  });
