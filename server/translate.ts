import faith from "../src/glossary/faith.json" with { type: "json" };
import { LANGS, type Lang, type TranslateResponse } from "../src/shared/types.ts";

type Triple = { en: string; es: string; pt: string };

const terms = [...(faith.terms as Triple[])].sort(
  (a, b) => Math.max(b.en.length, b.es.length, b.pt.length) - Math.max(a.en.length, a.es.length, a.pt.length),
);
const phrases = faith.phrases as Triple[];

const cache = new Map<string, string>();
const CACHE_MAX = 400;

function cacheGet(key: string): string | undefined {
  return cache.get(key);
}

function cacheSet(key: string, value: string) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, value);
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function preserveCase(source: string, replacement: string): string {
  if (!source) return replacement;
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function exactPhrase(text: string, source: Lang, target: Lang): string | null {
  const n = normalize(text)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/^["']|["']$/g, "")
    .replace(/[.!?]+$/g, "");
  for (const phrase of phrases) {
    const src = normalize(phrase[source])
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/^["']|["']$/g, "")
      .replace(/[.!?]+$/g, "");
    if (src && src === n) return phrase[target];
  }
  return null;
}

function cleanTranslated(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function applyGlossary(text: string, source: Lang, target: Lang): string {
  if (source === target) return text;
  const exact = exactPhrase(text, source, target);
  if (exact) return exact;

  let out = text;
  const sortedPhrases = [...phrases].sort((a, b) => b[source].length - a[source].length);
  for (const phrase of sortedPhrases) {
    const from = phrase[source];
    if (!from) continue;
    const re = new RegExp(escapeRegExp(from), "gi");
    out = out.replace(re, (match) => preserveCase(match, phrase[target]));
  }

  for (const term of terms) {
    const from = term[source];
    const to = term[target];
    if (!from || !to || from === to) continue;
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
    out = out.replace(re, (match) => preserveCase(match, to));
  }
  return out;
}

type ProviderName = "local" | "mymemory" | "deepl" | "google";

export function resolveProvider(): { provider: ProviderName; keyed: boolean; warning?: string } {
  const requested = (process.env.TRANSLATE_PROVIDER || "auto").toLowerCase();
  const deeplKey = process.env.DEEPL_API_KEY?.trim();
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();

  if (requested === "local") return { provider: "local", keyed: false };
  if (requested === "deepl") {
    return deeplKey
      ? { provider: "deepl", keyed: true }
      : { provider: "local", keyed: false, warning: "DEEPL_API_KEY is not set, so captions use the local glossary." };
  }
  if (requested === "google") {
    return googleKey
      ? { provider: "google", keyed: true }
      : { provider: "local", keyed: false, warning: "GOOGLE_TRANSLATE_API_KEY is not set, so captions use the local glossary." };
  }
  if (requested === "mymemory") return { provider: "mymemory", keyed: false };

  if (deeplKey) return { provider: "deepl", keyed: true };
  if (googleKey) return { provider: "google", keyed: true };
  return { provider: "mymemory", keyed: false };
}

async function translateWithTimeout(
  text: string,
  source: Lang,
  target: Lang,
  provider: ProviderName,
): Promise<string> {
  const known = exactPhrase(text, source, target);
  if (known) return known;

  const key = `${provider}|${source}|${target}|${text}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const local = applyGlossary(text, source, target);
  if (provider === "local") {
    cacheSet(key, local);
    return local;
  }

  try {
    const remote =
      provider === "deepl"
        ? await deeplTranslate(text, source, target)
        : provider === "google"
          ? await googleTranslate(text, source, target)
          : await myMemoryTranslate(text, source, target);
    const cleaned = cleanTranslated(remote);
    const withFaith = applyFaithTermsOnly(applyFaithTermsOnly(cleaned, "en", target), source, target);
    const finalText = withFaith || cleaned || local;
    cacheSet(key, finalText);
    return finalText;
  } catch {
    cacheSet(key, local);
    return local;
  }
}

function applyFaithTermsOnly(text: string, source: Lang, target: Lang): string {
  let out = text;
  for (const term of terms) {
    const from = term[source];
    const to = term[target];
    if (!from || !to) continue;
    const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
    out = out.replace(re, (match) => preserveCase(match, to));
  }
  return out;
}

async function myMemoryTranslate(text: string, source: Lang, target: Lang): Promise<string> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, 450));
  url.searchParams.set("langpair", `${source}|${target}`);
  const email = process.env.MYMEMORY_EMAIL?.trim();
  if (email) url.searchParams.set("de", email);

  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const body = (await res.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };
  const translated = body.responseData?.translatedText?.trim();
  if (!translated || (body.responseStatus && body.responseStatus !== 200)) {
    throw new Error("MyMemory returned no translation");
  }
  return translated;
}

async function deeplTranslate(text: string, source: Lang, target: Lang): Promise<string> {
  const key = process.env.DEEPL_API_KEY?.trim();
  if (!key) throw new Error("missing DeepL key");
  const base = (process.env.DEEPL_API_URL || "https://api-free.deepl.com").replace(/\/$/, "");
  const targetLang = target === "pt" ? "PT-BR" : target === "en" ? "EN" : "ES";
  const sourceLang = source === "pt" ? "PT" : source.toUpperCase();
  const res = await fetch(`${base}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      text,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
  const body = (await res.json()) as { translations?: { text?: string }[] };
  const translated = body.translations?.[0]?.text?.trim();
  if (!translated) throw new Error("DeepL returned no translation");
  return translated;
}

async function googleTranslate(text: string, source: Lang, target: Lang): Promise<string> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!key) throw new Error("missing Google key");
  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source,
      target,
      format: "text",
    }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: { translations?: { translatedText?: string }[] };
  };
  const translated = body.data?.translations?.[0]?.translatedText?.trim();
  if (!translated) throw new Error("Google returned no translation");
  return translated;
}

export async function translateLine(
  text: string,
  source: Lang,
  targets: Lang[],
): Promise<TranslateResponse> {
  const { provider, warning } = resolveProvider();
  const translations: Partial<Record<Lang, string>> = {};
  translations[source] = text;

  const uniqueTargets = [...new Set(targets.filter((lang) => LANGS.includes(lang)))];
  await Promise.all(
    uniqueTargets.map(async (target) => {
      if (target === source) {
        translations[target] = text;
        return;
      }
      translations[target] = await translateWithTimeout(text, source, target, provider);
    }),
  );

  const usedRemote = provider !== "local";
  return {
    translations,
    provider,
    warning:
      warning ||
      (usedRemote
        ? undefined
        : "Using the built-in fellowship glossary. Add a translate API key in .env for fuller sentences."),
  };
}
