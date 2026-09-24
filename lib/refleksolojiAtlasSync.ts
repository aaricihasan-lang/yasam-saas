"use client";

/**
 * refleksolojiAtlasSync — Refleksoloji Atlas sunucu senkronu (P1-1 + REF-001/REF-007).
 *
 * Atlas tenant başına TEK belgedir. Depolama katmanı her değişiklikte TAM belgeyi
 * bu modüle verir → /api/refleksoloji/atlas PUT (debounce'lu).
 *
 * REF-001 (optimistic concurrency): PUT gövdesinde `expected_updated_at` (sunucudan
 *   bilinen son değer) taşınır. Sunucu uyuşmazsa 409 döner → SESSİZ OVERWRITE YOK.
 *   409'da: sunucu belgesi çekilir, yerel ile TOMBSTONE-FARKINDA birleştirilir
 *   (mergeAtlasDocuments — iki sekmenin eklemeleri kaybolmaz), EN ÇOK 1 otomatik retry.
 *   Birleştirme atlasStorage'da tanımlı; döngüsel import olmasın diye buraya
 *   registerAtlasConflictResolver ile kaydedilir.
 *
 * REF-007 (gerçek save semantiği): senkron sonucu paylaşımlı syncStatus store'una
 *   yazılır (syncing/synced/error/offline/conflict) → UI gerçek sunucu durumunu gösterir,
 *   sessiz `catch {}` yerine görünür durum + yeniden dene.
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız kimlik başlıkları gönderir.
 * Demo/oturumsuz durumda senkron atlanır.
 */

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  setReflexologySyncStatus,
  isOffline,
} from "@/lib/refleksoloji/syncStatus";

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

// REF-001: sunucudan bilinen son updated_at (concurrency token).
let baseServerUpdatedAt: string | null = null;
export function setAtlasBaseUpdatedAt(v: string | null): void {
  baseServerUpdatedAt = v;
}

// Son gönderilen içerik (retry / "yeniden dene" için).
let lastPayload: { document: unknown; organ_list: string[] } | null = null;

// 409 conflict çözücü — atlasStorage kaydeder (sunucu+yerel birleştir, yerele yaz, döndür).
export type AtlasServerState = {
  document: Record<string, unknown> | null;
  organ_list: string[];
  updated_at: string | null;
};
type AtlasConflictResolver = (
  server: AtlasServerState,
) => { document: unknown; organ_list: string[] } | null;
let conflictResolver: AtlasConflictResolver | null = null;
export function registerAtlasConflictResolver(fn: AtlasConflictResolver): void {
  conflictResolver = fn;
}

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

/** "Yeniden dene" — son gönderilen içeriği tekrar dener. */
export function retryAtlasSync(): void {
  if (!lastPayload || !isEligible()) return;
  void flush(lastPayload.document, lastPayload.organ_list, true);
}

async function flush(
  document: unknown,
  organList: string[],
  retrying = false,
): Promise<void> {
  const headers = userHeaders();
  if (!headers) return;

  lastPayload = { document, organ_list: organList };
  const dedupeKey = JSON.stringify({ document, organ_list: organList });
  if (!retrying && dedupeKey === lastSentHash) return; // aynı içerik → tekrar gönderme

  const body = JSON.stringify({
    document,
    organ_list: organList,
    expected_updated_at: baseServerUpdatedAt,
  });

  setReflexologySyncStatus({ state: "syncing", message: "Atlas eşitleniyor…" });
  try {
    const res = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body,
    });

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as
        | { updated_at?: string }
        | null;
      if (json?.updated_at) baseServerUpdatedAt = json.updated_at;
      lastSentHash = dedupeKey;
      setReflexologySyncStatus({ state: "synced", message: "Atlas eşitlendi" });
      return;
    }

    if (res.status === 409) {
      // Zaten bir kez birleştirip yeniden denedik → sonsuz döngü yok. Sunucu gerçeğini
      // al (base tazele), kullanıcıya görünür conflict bildir; veri yerelde güvende.
      if (retrying) {
        await hydrateAtlasFromServer();
        setReflexologySyncStatus({
          state: "conflict",
          message: "Atlas başka bir cihazda güncellendi — yeniden denendi.",
          retry: retryAtlasSync,
        });
        return;
      }
      // İlk 409: sunucuyu çek (baseServerUpdatedAt güncellenir), yerelle birleştir, 1 retry.
      const server = await hydrateAtlasFromServer();
      if (server && conflictResolver) {
        const merged = conflictResolver(server);
        if (merged) {
          await flush(merged.document, merged.organ_list, true);
          return;
        }
      }
      setReflexologySyncStatus({
        state: "conflict",
        message: "Atlas başka bir cihazda güncellendi.",
        retry: retryAtlasSync,
      });
      return;
    }

    setReflexologySyncStatus({
      state: "error",
      message: "Atlas eşitlenemedi.",
      retry: retryAtlasSync,
    });
  } catch {
    setReflexologySyncStatus(
      isOffline()
        ? { state: "offline", message: "Çevrimdışı — atlas cihazda saklandı." }
        : { state: "error", message: "Atlas eşitlenemedi.", retry: retryAtlasSync },
    );
  }
}

/** Sunucudan atlas belgesini indirir. Dönüş null → demo/oturumsuz/erişilemez. */
export async function hydrateAtlasFromServer(): Promise<AtlasServerState | null> {
  const headers = userHeaders();
  if (!headers || !isEligible()) return null;
  try {
    const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          document?: Record<string, unknown> | null;
          organ_list?: unknown;
          updated_at?: string | null;
        }
      | null;
    if (!json?.ok) return null;
    const organ_list = Array.isArray(json.organ_list)
      ? json.organ_list.filter((o): o is string => typeof o === "string")
      : [];
    // Sunucudan gelen içerik = son bilinen durum → hemen geri PUT etme + base'i güncelle.
    lastSentHash = JSON.stringify({ document: json.document ?? {}, organ_list });
    baseServerUpdatedAt = json.updated_at ?? null;
    return {
      document: json.document ?? null,
      organ_list,
      updated_at: json.updated_at ?? null,
    };
  } catch {
    return null;
  }
}
