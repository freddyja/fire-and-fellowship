import type { Lang, TranslateResponse } from "../shared/types";

export async function translateLine(
  text: string,
  source: Lang,
  targets: Lang[],
): Promise<TranslateResponse> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source, targets }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Translate failed (${res.status})`);
  }
  return (await res.json()) as TranslateResponse;
}

export type HealthResponse = {
  ok: boolean;
  provider: string;
  keyed: boolean;
  warning?: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Caption server is not reachable.");
  return (await res.json()) as HealthResponse;
}
