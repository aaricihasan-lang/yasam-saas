"use client";

/**
 * H-10 — Danışan Yolculuğu Numerolojik Özet istemci kancası. Hesap TARAYICIDA YAPILMAZ:
 * değerler yalnız /api/clients/[id]/numerology-summary'den (clients + tenant + numerology yetkisi,
 * Gelecek Yıllar süzgeci sunucuda) okunur. 403 → "forbidden": yetkisiz kullanıcıya hiçbir sonuç gösterilmez.
 */
import { useEffect, useState } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { runInEffect } from "@/lib/runInEffect";
import type { NumerologySummary } from "@/lib/danisan/numerologySummary";

export type NumerologySummaryState =
  | { status: "idle" | "loading" | "forbidden" | "error"; summary: null }
  | { status: "ok"; summary: NumerologySummary | null };

export async function fetchNumerologySummary(
  clientId: string,
  overrides?: { ad: string; soyad: string; dogum: string },
  signal?: AbortSignal,
): Promise<NumerologySummaryState> {
  // Form önizlemesi kişisel veri taşır → URL'ye değil POST gövdesine (erişim günlüklerine düşmez).
  const token = readSessionToken();
  const res = await fetch(`/api/clients/${clientId}/numerology-summary`, {
    method: overrides ? "POST" : "GET",
    headers: {
      "x-user-id": readYasamUser()?.id ?? "",
      ...(token ? { "x-session-token": token } : {}),
      ...(overrides ? { "content-type": "application/json" } : {}),
    },
    body: overrides ? JSON.stringify(overrides) : undefined,
    signal,
  }).catch(() => null);
  if (!res) return { status: "error", summary: null };
  if (res.status === 403) return { status: "forbidden", summary: null };
  if (!res.ok) return { status: "error", summary: null };
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: NumerologySummary | null };
  return json.ok ? { status: "ok", summary: json.summary ?? null } : { status: "error", summary: null };
}

/** Form değerleri değiştikçe (Genel Bilgiler düzenlenirken) kısa gecikmeyle yeniden okur. */
export function useNumerologySummary(clientId: string, ad: string, soyad: string, dogum: string): NumerologySummaryState {
  const [state, setState] = useState<NumerologySummaryState>({ status: "idle", summary: null });
  useEffect(() => {
    if (!clientId || !dogum.trim()) { runInEffect(() => setState({ status: "idle", summary: null })); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setState((s) => (s.status === "ok" ? s : { status: "loading", summary: null }));
      void fetchNumerologySummary(clientId, { ad, soyad, dogum }, ctrl.signal).then((r) => { if (!ctrl.signal.aborted) setState(r); });
    }, 350);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [clientId, ad, soyad, dogum]);
  return state;
}
