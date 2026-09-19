import type { ClientMessage, Role, RoomState, ServerMessage } from "./types";

export type ConnectionStatus = "connecting" | "open" | "closed";

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function connectRoom(opts: {
  room: string;
  role: Role;
  onState: (state: RoomState) => void;
  onStatus: (status: ConnectionStatus) => void;
  onError: (message: string) => void;
}): { send: (msg: ClientMessage) => void; close: () => void } {
  let socket: WebSocket | null = null;
  let closedByUser = false;
  let retry = 0;
  let timer: number | undefined;

  const open = () => {
    opts.onStatus("connecting");
    socket = new WebSocket(wsUrl());

    socket.addEventListener("open", () => {
      retry = 0;
      opts.onStatus("open");
      socket?.send(
        JSON.stringify({
          type: "join",
          room: opts.room,
          role: opts.role,
        } satisfies ClientMessage),
      );
    });

    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        if (msg.type === "state") opts.onState(msg.state);
        if (msg.type === "error") opts.onError(msg.message);
      } catch {
        opts.onError("The TV link received a message it could not read.");
      }
    });

    socket.addEventListener("close", () => {
      opts.onStatus("closed");
      if (!closedByUser) {
        const wait = Math.min(8000, 400 * 2 ** retry);
        retry += 1;
        timer = window.setTimeout(open, wait);
      }
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  };

  open();

  return {
    send(msg) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    },
    close() {
      closedByUser = true;
      if (timer) window.clearTimeout(timer);
      socket?.close();
    },
  };
}
