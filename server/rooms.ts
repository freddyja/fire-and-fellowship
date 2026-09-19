import type { WebSocket } from "ws";
import type { CaptionState, Lang, LayoutState, Role, RoomState } from "../src/shared/types.ts";
import { resolveProvider } from "./translate.ts";

type Peer = {
  ws: WebSocket;
  role: Role;
};

type Room = {
  id: string;
  layout: LayoutState;
  caption: CaptionState | null;
  listening: boolean;
  sourceLang: Lang;
  peers: Set<Peer>;
};

const rooms = new Map<string, Room>();

function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    room = {
      id,
      layout: { mode: "columns", languages: ["en", "es", "pt"] },
      caption: null,
      listening: false,
      sourceLang: "en",
      peers: new Set(),
    };
    rooms.set(id, room);
  }
  return room;
}

export function snapshot(room: Room): RoomState {
  const health = resolveProvider();
  let phones = 0;
  let tvs = 0;
  for (const peer of room.peers) {
    if (peer.role === "phone") phones += 1;
    else tvs += 1;
  }
  return {
    room: room.id,
    layout: room.layout,
    caption: room.caption,
    listening: room.listening,
    sourceLang: room.sourceLang,
    phones,
    tvs,
    translateProvider: health.provider,
    translateWarning: health.warning,
  };
}

function broadcast(room: Room) {
  const payload = JSON.stringify({ type: "state", state: snapshot(room) });
  for (const peer of room.peers) {
    if (peer.ws.readyState === 1) peer.ws.send(payload);
  }
}

export function joinRoom(ws: WebSocket, roomId: string, role: Role): Room {
  const room = getRoom(roomId);
  const peer: Peer = { ws, role };
  room.peers.add(peer);
  (ws as WebSocket & { ffPeer?: Peer; ffRoom?: Room }).ffPeer = peer;
  (ws as WebSocket & { ffPeer?: Peer; ffRoom?: Room }).ffRoom = room;
  broadcast(room);
  return room;
}

export function leaveSocket(ws: WebSocket) {
  const tagged = ws as WebSocket & { ffPeer?: Peer; ffRoom?: Room };
  const room = tagged.ffRoom;
  const peer = tagged.ffPeer;
  if (!room || !peer) return;
  room.peers.delete(peer);
  if (room.peers.size === 0) rooms.delete(room.id);
  else broadcast(room);
}

export function setLayout(ws: WebSocket, layout: LayoutState) {
  const room = (ws as WebSocket & { ffRoom?: Room }).ffRoom;
  if (!room) return;
  const languages = layout.languages.filter((lang, i, arr) => arr.indexOf(lang) === i);
  if (!languages.length) return;
  room.layout = {
    mode: languages.length === 1 ? "single" : layout.mode === "single" ? "single" : "columns",
    languages,
  };
  broadcast(room);
}

export function setCaption(ws: WebSocket, caption: CaptionState) {
  const room = (ws as WebSocket & { ffRoom?: Room }).ffRoom;
  if (!room) return;
  room.caption = caption;
  broadcast(room);
}

export function setControl(ws: WebSocket, listening: boolean, sourceLang: Lang) {
  const room = (ws as WebSocket & { ffRoom?: Room }).ffRoom;
  if (!room) return;
  room.listening = listening;
  room.sourceLang = sourceLang;
  broadcast(room);
}
