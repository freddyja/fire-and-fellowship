import "./styles.css";
import { normalizeRoomCode, randomRoomCode } from "./shared/roomCode";

const roomInput = document.querySelector<HTMLInputElement>("#room")!;
const created = document.querySelector<HTMLElement>("#created")!;
const phoneLink = document.querySelector<HTMLAnchorElement>("#phone-link")!;
const tvLink = document.querySelector<HTMLAnchorElement>("#tv-link")!;

const params = new URLSearchParams(location.search);
if (params.get("room")) roomInput.value = params.get("room")!.toUpperCase();

function syncLinks() {
  const code = normalizeRoomCode(roomInput.value);
  const q = code ? `?room=${encodeURIComponent(code)}` : "";
  phoneLink.href = `/live/phone.html${q}`;
  tvLink.href = `/live/tv.html${q}`;
}

document.querySelector("#create")!.addEventListener("click", () => {
  const code = randomRoomCode();
  roomInput.value = code;
  created.textContent = `Room ${code} is ready. Open Phone on this device, TV on the other.`;
  syncLinks();
});

roomInput.addEventListener("input", syncLinks);
syncLinks();
