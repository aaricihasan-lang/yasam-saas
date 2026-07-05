"use client";

/**
 * notesSync — Klinik Notlar sunucu senkronu (P1-1).
 *
 * Depolama katmanı (noteStorage.saveNotesToStorage) her TAM listeyi yazdığında bu
 * modül aynı listeyi /api/refleksoloji/notes'a PUT eder (debounce'lu). İlk açılışta
 * hydrateNotesFromServer sunucu gerçeğini indirir; sunucu boşsa yereldeki notlar
 * sunucuya taşınır (migrate). Sunucu erişilemezse yerel veri KORUNUR (veri kaybı yok).
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız x-user-id + x-session-token
 * gönderir. Demo hesap ve oturumsuz durumda senkron atlanır.
 */

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
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

async function flush(notes: SavedClinicalNote[]): Promise<void> {
  const headers = userHeaders();
  if (!headers) return;
  try {
    await fetch(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
  } catch {
    // Sessiz — yerel kayıt zaten güvende; sonraki kaydetmede tekrar denenir.
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
