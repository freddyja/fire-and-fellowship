export const LANGS = ["en", "es", "pt"] as const;
export type Lang = (typeof LANGS)[number];
export type Role = "phone" | "tv";

export const LANG_META: Record<
  Lang,
  { label: string; short: string; speech: string }
> = {
  en: { label: "English", short: "EN", speech: "en-US" },
  es: { label: "Español", short: "ES", speech: "es-US" },
  pt: { label: "Português", short: "PT", speech: "pt-BR" },
};

export type LayoutState = {
  mode: "single" | "columns";
  languages: Lang[];
};

export type CaptionState = {
  id: string;
  sourceLang: Lang;
  interim: boolean;
  sourceText: string;
  textByLang: Partial<Record<Lang, string>>;
  at: number;
};

export type RoomState = {
  room: string;
  layout: LayoutState;
  caption: CaptionState | null;
  listening: boolean;
  sourceLang: Lang;
  phones: number;
  tvs: number;
  translateProvider: string;
  translateWarning?: string;
};

export type ClientMessage =
  | { type: "join"; room: string; role: Role }
  | { type: "layout"; layout: LayoutState }
  | { type: "caption"; caption: CaptionState }
  | { type: "control"; listening: boolean; sourceLang: Lang };

export type ServerMessage =
  | { type: "state"; state: RoomState }
  | { type: "error"; message: string };

export type TranslateResponse = {
  translations: Partial<Record<Lang, string>>;
  provider: string;
  warning?: string;
};

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}
