"use client";

/**
 * refleksolojiAtlasSync — Refleksoloji Atlas sunucu senkronu (P1-1).
 *
 * Atlas tenant başına TEK belgedir. Depolama katmanı (atlasStorage.saveAtlas /
 * saveOrganList) her değişiklikte TAM belgeyi bu modüle verir → /api/refleksoloji/atlas
 * PUT (debounce'lu, aynı içerik tekrar gönderilmez). İlk açılışta hydrateAtlasFromServer
 * sunucu gerçeğini indirir; sunucu boşsa yereldeki atlas taşınır. Sunucu erişilemezse
 * yerel veri KORUNUR (veri kaybı yok).
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız kimlik başlıkları gönderir.
 * Demo/oturumsuz durumda senkron atlanır.
 *
 * NOT: atlasStorage'ı import ETMEZ (döngüsel bağımlılık olmasın) — çağıran, belge ve
 * organ listesini parametre olarak verir.
 */

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

const ENDPOINT = "/api/refleksoloji/atlas";

let suspended = false;
export function setAtlasSyncSuspended(v: boolean): void {
  suspended = v;
}

function userHeaders(): Record<string, string> | null {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  if (!uid || !token) return null;
  return { "x-user-id": uid, "x-session-token": token };
}

function isEligible(): boolean {
  if (typeof window === "undefined") return false;
  if (readYasamUser()?.is_demo_account === true) return false;
  return userHeaders() !== null;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDoc: unknown = null;
let pendingList: string[] = [];
let lastSentHash: string | null = null;

/** Yerel kaydetme sonrası çağrılır — tam belgeyi sunucuya (debounce'lu) yazar. */
export function scheduleAtlasSync(document: unknown, organList: string[]): void {
  if (suspended || !isEligible()) return;
  pendingDoc = document;
  pendingList = organList;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flush(pendingDoc, pendingList);
  }, 600);
}

async function flush(document: unknown, organList: string[]): Promise<void> {
  const headers = userHeaders();
  if (!headers) return;
  const body = JSON.stringify({ document, organ_list: organList });
  if (body === lastSentHash) return; // aynı içerik → tekrar gönderme (mount echo'sunu keser)
  try {
    const res = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body,
    });
    if (res.ok) lastSentHash = body;
  } catch {
    // Sessiz — yerel güvende; sonraki kaydetmede tekrar denenir.
  }
}

export type AtlasServerState = {
  document: Record<string, unknown> | null;
  organ_list: string[];
};

/** Sunucudan atlas belgesini indirir. Dönüş null → demo/oturumsuz/erişilemez. */
export async function hydrateAtlasFromServer(): Promise<AtlasServerState | null> {
  const headers = userHeaders();
  if (!headers || !isEligible()) return null;
  try {
    const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; document?: Record<string, unknown> | null; organ_list?: unknown }
      | null;
    if (!json?.ok) return null;
    // Sunucudan gelen içerik = son bilinen durum → hemen geri PUT etme.
    lastSentHash = JSON.stringify({
      document: json.document ?? {},
      organ_list: Array.isArray(json.organ_list) ? json.organ_list : [],
    });
    return {
      document: json.document ?? null,
      organ_list: Array.isArray(json.organ_list)
        ? json.organ_list.filter((o): o is string => typeof o === "string")
        : [],
    };
  } catch {
    return null;
  }
}
