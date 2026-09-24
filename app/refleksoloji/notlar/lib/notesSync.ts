"use client";

/**
 * notesSync — Klinik Notlar sunucu senkronu (P1-1 + REF-003/REF-004/REF-007).
 *
 * Depolama katmanı (noteStorage.saveNotesToStorage) her TAM listeyi yazdığında bu
 * modül aynı listeyi /api/refleksoloji/notes'a PUT eder (debounce'lu).
 *
 * ⚠️ SİLME (REF-004): sunucu artık "listede olmayanı sil" YAPMAZ. Silme YALNIZ açık
 *   silme kuyruğu ile olur. `queueNoteDeletion(uid, expectedUpdatedAt)` silinen not
 *   id'lerini (ve o an bilinen server sürümünü) biriktirir; sonraki PUT ile gönderilir.
 *
 * ⚠️ EŞZAMANLILIK (REF-003): her not `baseUpdatedAt` (son gözlemlenen server sürümü)
 *   ile gönderilir; server bunu CAS beklenen sürümü olarak kullanır. Stale güncelleme
 *   409 döner ve sonuç listesinde `conflict` gelir → yerel metin KORUNUR, görünür
 *   conflict durumu gösterilir, yeniden yükleme (server'dan tazeleme) yolu sunulur.
 *   Silme de expectedUpdatedAt taşır → stale delete `delete-conflict` ile engellenir
 *   (server sürümü geri yüklenir).
 *
 * REF-007: senkron sonucu paylaşımlı syncStatus store'una yazılır (görünür durum +
 *   yeniden dene); sessiz `catch {}` yerine gerçek sunucu sonucu yansıtılır.
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız kimlik başlıkları gönderir.
 * Demo/oturumsuz durumda senkron atlanır.
 */

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { setReflexologySyncStatus, isOffline } from "@/lib/refleksoloji/syncStatus";
import type { NoteSyncResult } from "@/lib/refleksoloji/notesConcurrency";
import type { SavedClinicalNote } from "../types";

const ENDPOINT = "/api/refleksoloji/notes";

// Hydrate sırasında yerel yazma → sunucuya geri-yankı PUT'unu engelle.
let suspended = false;
export function setNotesSyncSuspended(v: boolean): void {
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
let pending: SavedClinicalNote[] | null = null;
// Açık silme kuyruğu (REF-004): uid → o an bilinen server sürümü (CAS için).
const pendingDeletes = new Map<string, string | null>();
let lastPayload: SavedClinicalNote[] | null = null;

/**
 * Bir notun SİLİNDİĞİNİ işaretler → sonraki senkronda sunucudan da silinir.
 * `expectedUpdatedAt` verilirse stale-delete koruması (REF-003) uygulanır.
 */
export function queueNoteDeletion(uid: string, expectedUpdatedAt?: string | null): void {
  if (uid) pendingDeletes.set(uid, expectedUpdatedAt ?? null);
}

/** Yerel kaydetme sonrası çağrılır — tam listeyi sunucuya (debounce'lu) yazar. */
export function scheduleNotesSync(notes: SavedClinicalNote[]): void {
  if (suspended || !isEligible()) return;
  pending = notes;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const payload = pending;
    pending = null;
    if (!payload) return;
    void flush(payload);
  }, 500);
}

/** "Yeniden dene" — son gönderilen listeyi (+ bekleyen silmeleri) tekrar dener. */
export function retryNotesSync(): void {
  if (!lastPayload || !isEligible()) return;
  void flush(lastPayload);
}

/** Silme yükünü (uid + expected) dizi olarak üretir. */
function buildDeletionsPayload(): Array<{ uid: string; expected_updated_at: string | null }> {
  return [...pendingDeletes.entries()].map(([uid, expected]) => ({
    uid,
    expected_updated_at: expected,
  }));
}

async function flush(notes: SavedClinicalNote[]): Promise<void> {
  const headers = userHeaders();
  if (!headers) return;
  lastPayload = notes;
  const deletions = buildDeletionsPayload();

  setReflexologySyncStatus({ state: "syncing", message: "Notlar eşitleniyor…" });
  try {
    const res = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ notes, deleted_uids: deletions }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; results?: NoteSyncResult[]; conflicts?: number }
      | null;
    const results = Array.isArray(json?.results) ? (json!.results as NoteSyncResult[]) : [];

    // Sonuçları yerel depoya uygula: created/updated → baseUpdatedAt tazele;
    // delete-conflict → server sürümünü geri yükle. (Dinamik import → import döngüsü yok.)
    if (results.length > 0) {
      try {
        const { applyServerNoteSync } = await import("./noteStorage");
        applyServerNoteSync(results);
      } catch {
        /* uygula başarısız olsa da durum raporu aşağıda ayarlanır */
      }
    }

    // Başarıyla işlenen (deleted / delete-noop) silmeleri kuyruktan temizle;
    // delete-conflict olanları KORU (kullanıcı yeniden karar verene dek).
    for (const r of results) {
      if (r.outcome === "deleted" || r.outcome === "delete-noop") {
        pendingDeletes.delete(r.uid);
      }
    }

    const conflicts = typeof json?.conflicts === "number" ? json.conflicts : 0;
    if (res.status === 409 || conflicts > 0) {
      setReflexologySyncStatus({
        state: "conflict",
        message:
          "Bazı notlar başka bir cihazda değiştirilmiş. Yerel metniniz korundu; sunucudaki güncel sürümü yeniden yükleyebilirsiniz.",
        retry: reloadNotesFromServer,
      });
      return;
    }
    if (res.ok) {
      setReflexologySyncStatus({ state: "synced", message: "Notlar eşitlendi" });
      return;
    }
    setReflexologySyncStatus({
      state: "error",
      message: "Notlar eşitlenemedi.",
      retry: retryNotesSync,
    });
  } catch {
    setReflexologySyncStatus(
      isOffline()
        ? { state: "offline", message: "Çevrimdışı — notlar cihazda saklandı." }
        : { state: "error", message: "Notlar eşitlenemedi.", retry: retryNotesSync },
    );
  }
}

/**
 * Sunucudan notları indirir. Dönüş: sunucu listesi (senkron aktifse) veya null
 * (demo/oturumsuz/erişilemez → çağıran yereli korur).
 */
export async function hydrateNotesFromServer(): Promise<SavedClinicalNote[] | null> {
  const headers = userHeaders();
  if (!headers || !isEligible()) return null;
  try {
    const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; notes?: unknown[] }
      | null;
    if (!json?.ok || !Array.isArray(json.notes)) return null;
    return json.notes as SavedClinicalNote[];
  } catch {
    return null;
  }
}

/**
 * Conflict "yeniden yükle" yolu (REF-003): sunucudan güncel notları çeker ve
 * ÇAKIŞAN notların `baseUpdatedAt`'ini server sürümüne ADAPTE eder (yerel metin
 * korunur). Böylece kullanıcı aynı notu tekrar kaydettiğinde CAS geçer (bilinçli
 * yeniden gönderim). Sunucuda olup yerelde olmayan notlar da eklenir.
 */
export async function reloadNotesFromServer(): Promise<void> {
  if (!isEligible()) return;
  const server = await hydrateNotesFromServer();
  if (!server) return;
  try {
    const { loadNotesFromStorage, saveNotesToStorage, CLINICAL_NOTES_UPDATED_EVENT } =
      await import("./noteStorage");
    const local = loadNotesFromStorage();
    const byId = new Map(local.map((n) => [n.id, n]));
    for (const s of server) {
      if (!s || typeof s.id !== "string") continue;
      const existing = byId.get(s.id);
      if (existing) {
        // Yerel metni KORU; yalnız base'i server'ın güncel sürümüne çek.
        byId.set(s.id, { ...existing, baseUpdatedAt: s.baseUpdatedAt });
      } else {
        byId.set(s.id, s);
      }
    }
    const next = [...byId.values()].sort((a, b) =>
      String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
    );
    setNotesSyncSuspended(true);
    saveNotesToStorage(next);
    setNotesSyncSuspended(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CLINICAL_NOTES_UPDATED_EVENT));
    }
    setReflexologySyncStatus({ state: "idle", message: "" });
  } catch {
    /* sessiz — kullanıcı tekrar deneyebilir */
  }
}
