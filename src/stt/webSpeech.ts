import type { Lang } from "../shared/types";
import { LANG_META } from "../shared/types";

export type SttHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onStart: () => void;
  onStop: () => void;
};

export function speechRecognitionSupported(): boolean {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createWebSpeechStt(lang: Lang, handlers: SttHandlers) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    return {
      supported: false as const,
      start() {
        handlers.onError(
          "This browser cannot turn speech into text. Chrome on Android or desktop is the most reliable. You can still type a line below.",
        );
      },
      stop() {},
      setLang(_next: Lang) {},
    };
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = LANG_META[lang].speech;

  let wanted = false;
  let stopping = false;

  recognition.onstart = () => handlers.onStart();
  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i][0]?.transcript?.trim() ?? "";
      if (!piece) continue;
      if (event.results[i].isFinal) finalText = joinUtterance(finalText, piece);
      else interim = joinUtterance(interim, piece);
    }
    if (interim) handlers.onPartial(interim);
    if (finalText) handlers.onFinal(finalText);
  };
  recognition.onerror = (event) => {
    const error = event.error;
    if (error === "not-allowed" || error === "service-not-allowed") {
      handlers.onError(
        "The browser blocked the microphone. Tap Start again and allow the mic, or type a line below.",
      );
      wanted = false;
    } else if (error === "no-speech") {
      // Restart loop will pick this up; not a hard failure.
    } else if (error === "aborted") {
      // Expected when we stop.
    } else {
      handlers.onError(`Speech recognition hit a snag (${error}). Try Start again, or type a line.`);
    }
  };
  recognition.onend = () => {
    if (wanted && !stopping) {
      try {
        recognition.start();
      } catch {
        handlers.onStop();
      }
    } else {
      handlers.onStop();
    }
  };

  return {
    supported: true as const,
    start() {
      wanted = true;
      stopping = false;
      try {
        recognition.start();
      } catch {
        // Already started
      }
    },
    stop() {
      wanted = false;
      stopping = true;
      try {
        recognition.stop();
      } catch {
        handlers.onStop();
      }
    },
    setLang(next: Lang) {
      recognition.lang = LANG_META[next].speech;
    },
  };
}

function joinUtterance(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

export type CloudSttAdapter = {
  /** Plug in a cloud STT later (Deepgram, Google, Whisper). Unused in the MVP. */
  start(_stream: MediaStream): Promise<void>;
  stop(): void;
};
